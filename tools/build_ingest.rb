#!/usr/bin/env ruby
# frozen_string_literal: true

# Builds ingest chunks for one relaton-data-* checkout:
#   out/<flavor>/chunk-NNNN.json = { flavor, repo, final, rows: [...], blobs: { r2_key => xml } }
# Post them with tools/post_chunks.sh.

require "optparse"
require "fileutils"
require "json"
require "yaml"

options = { chunk_size: 100 }
OptionParser.new do |o|
  o.banner = "Usage: build_ingest.rb -r REPO -f FLAVOR [-o OUT_DIR] [-l LIMIT] [-c CHUNK_SIZE]"
  o.on("-r REPO", "--repo REPO", "path to relaton-data-* checkout")
  o.on("-f FLAVOR", "--flavor FLAVOR", "flavor short name, e.g. iso")
  o.on("-o DIR", "--out DIR", "output directory (default: out/<flavor>)")
  o.on("-l N", "--limit N", Integer, "process at most N documents")
  o.on("-c N", "--chunk-size N", Integer, "documents per chunk (default 100)")
  o.on("-s N", "--skip N", Integer, "skip the first N files (shard start)")
end.parse!(into: options)

abort "--repo is required" unless options[:repo]
abort "--flavor is required" unless options[:flavor]

out_dir = options[:out] || File.join("out", options[:flavor])
FileUtils.mkdir_p(out_dir)

require "relaton"
require "relaton/bib/hash_parser_v1"
require "relaton/bib/item_data"
require "pubid"

# Flavors with a PubID grammar; canonical renders add lookup variants that
# absorb update_codes.yaml normalizations (e.g. "ISO/IEC Directives Part 1" →
# "ISO/IEC DIR 1").
# Lookup keys derived through the pubid gem (structural year/part values);
# parity with pubid-ts is enforced by the golden corpus (gen_corpus.rb).
def derive_keys(code, flavor)
  mod = pubid_module(flavor)
  canonical = code
  year = ""
  part = ""
  if mod
    begin
      id = pubid_parse!(mod, code)
      canonical = id.to_s
      year = id.year.to_s
      raw_part = id.part
      part = raw_part.is_a?(String) ? raw_part : raw_part&.value.to_s if raw_part
    rescue StandardError
      canonical = code
    end
  end
  norm = canonical.upcase.delete(" ")
  undated = norm.gsub(/:?(?:19|20)\d{2}(?=[^-]*$)/, "")
  allparts = part.empty? ? undated : undated.sub(/-#{Regexp.escape(part)}(?=[^-]*$)/, "")
  [norm, undated, allparts]
end

# Pubid components of the primary docid, for the API's component search
# (migration 0005). Absent components become nil so the columns stay NULL.
# pubid >= 2 puts the parse entry on the flavor module (Pubid::Ieee.parse);
# the released 1.15.x line only has Pubid::<Flavor>::Identifier.parse.
def pubid_parse!(mod, code)
  mod.respond_to?(:parse) ? mod.parse(code) : mod.const_get(:Identifier, false).parse(code)
end

def pubid_components(code, flavor)
  mod = pubid_module(flavor)
  return {} unless mod

  id = pubid_parse!(mod, code)
  part = id.respond_to?(:parts) ? Array(id.parts).first : nil
  part = id.part if part.nil? && id.respond_to?(:part)
  edition = id.respond_to?(:edition) ? id.edition : nil
  {
    publisher: id.respond_to?(:publisher) ? id.publisher&.to_s : nil,
    number: id.number.to_s,
    part: part.is_a?(String) ? part : part&.value.to_s,
    edition: edition.is_a?(String) ? edition : edition&.to_s,
  }.transform_values { |v| v.to_s.strip.empty? ? nil : v }
rescue StandardError => e
  warn "  [components] #{code}: #{e.class}: #{e.message}"
  {}
end

# Every collection whose identifiers have a pubid grammar. pubid main also
# carries 3gpp as Pubid::Tgpp; itu-r, rfcs and rfcsubseries have none.
PUBID_FLAVORS = {
  "adobe" => :Adobe, "bipm" => :Bipm, "bsi" => :Bsi,
  "calconnect" => :Calconnect, "ccsds" => :Ccsds, "cie" => :Cie,
  "easc" => :Easc, "ecma" => :Ecma, "etsi" => :Etsi, "gost" => :Gost,
  "iala" => :Iala, "iana" => :Iana, "iho" => :Iho, "iso" => :Iso,
  "iec" => :Iec, "ieee" => :Ieee, "itu" => :Itu, "jcgm" => :Jcgm,
  "jis" => :Jis, "nist" => :Nist, "oasis" => :Oasis, "ogc" => :Ogc,
  "oiml" => :Oiml, "plateau" => :Plateau, "w3c" => :W3c, "xsf" => :Xsf,
  "3gpp" => :Tgpp,
}.freeze

# pubid ships each flavor under its own gem name; 3gpp is pubid/tgpp.
PUBID_REQUIRE = { "3gpp" => "tgpp" }.freeze

def pubid_module(flavor)
  mod_name = PUBID_FLAVORS[flavor]
  return nil unless mod_name

  require "pubid/#{PUBID_REQUIRE.fetch(flavor, flavor)}"
  Pubid.const_get(mod_name, false)
rescue LoadError, NameError
  nil
end

def pubid_canonicals(docid_list, flavor)
  mod = pubid_module(flavor)
  return [] unless mod

  docid_list.filter_map do |d|
    next if d["type"] == "URN"

    id = begin
      pubid_parse!(mod, d["content"].to_s)
    rescue StandardError
      next
    end
    canonical = id.to_s
    canonical unless canonical.nil? || canonical.empty?
  end.uniq
end

repo = "relaton/relaton-data-#{options[:flavor]}"
files = %w[data static].flat_map { |d| Dir[File.join(options[:repo], d, "**", "*.{yaml,xml}")] }.sort
files = files.drop(options[:skip]) if options[:skip]
files = files.first(options[:limit]) if options[:limit]
abort "no yaml files under #{options[:repo]}/{data,static}" if files.empty?

last_modified =
  begin
    File.read(File.join(options[:repo], "last_modified.txt")).strip
  rescue StandardError
    nil
  end

def extract_status(status)
  case status
  when String then status
  when Hash then status["stage"].is_a?(Hash) ? status["stage"]["value"] : status["stage"]
  end
end

# Old-schema (v1.2.x) docs go through the gem's own v1 hash parser.
# Docs whose prefix no flavor processor claims use the generic Bib model.
# v1.5 YAML carries flavor-specific structures (ISO agency, ext), so each
# flavor parses with its own model in the relaton gem. The abstract
# Core::Processor#from_yaml is unimplemented across flavors (v3 gap), so the
# old processor route raised for every v1.5 file. Flavors without a model
# (itu-r, rfcs, rfcsubseries) use the generic Bib item.
FLAVOR_ITEM_MODULES = {
  "3gpp" => "ThreeGpp", "adobe" => "Adobe", "bipm" => "Bipm",
  "calconnect" => "Calconnect", "ccsds" => "Ccsds", "cie" => "Cie",
  "easc" => "Easc", "ecma" => "Ecma", "etsi" => "Etsi", "gost" => "Gost",
  "iala" => "Iala", "iana" => "Iana", "iec" => "Iec", "ieee" => "Ieee",
  "ietf" => "Ietf", "iho" => "Iho", "iso" => "Iso", "itu" => "Itu",
  "jcgm" => "Jcgm", "jis" => "Jis", "nist" => "Nist", "oasis" => "Oasis",
  "ogc" => "Ogc", "oiml" => "Oiml", "plateau" => "Plateau",
  "w3c" => "W3c", "xsf" => "Xsf",
}.freeze

def item_class(flavor)
  name = FLAVOR_ITEM_MODULES[flavor]
  (name && Relaton.const_get(name).const_get(:Item)) || Relaton::Bib::Item
rescue NameError
  Relaton::Bib::Item
end

def chunk_payload(flavor, repo, last_modified, chunk_rows, chunk_blobs, final:)
  {
    flavor: flavor,
    repo: repo,
    final: final,
    lastModified: last_modified,
    relatonVersion: "data-repos",
    rows: chunk_rows,
    blobs: chunk_blobs,
  }
end

def xml_for(doc, text, flavor, path)
  if path.end_with?(".xml")
    require "relaton/ietf/bibxml_parser"
    Relaton::Ietf::BibXMLParser.parse(text).to_xml(bibdata: true)
  elsif doc["docid"]
    bib_hash = Relaton::Bib::HashParserV1.hash_to_bib(doc)
    Relaton::Bib::ItemData.new(**bib_hash).to_xml(bibdata: true)
  else
    item_class(flavor).from_yaml(text).to_xml(bibdata: true)
  end
end

# Extracts index metadata from IETF bibxml (<reference>) files.
# Every RFC/BCP/STD/FYI seriesInfo is indexed as a lookup variant
# (e.g. "RFC 3986" is also "STD 66").
def ietf_xml_meta(text)
  anchor = text[/anchor=['"]([^'"]+)['"]/, 1]
  ids = text.scan(/seriesInfo\s+name=['"](RFC|BCP|STD|FYI)['"]\s+value=['"]([^'"]+)['"]/i)
            .map { |n, v| "#{n.upcase} #{v}" }
  ids += text.scan(/seriesInfo\s+value=['"]([^'"]+)['"]\s+name=['"](RFC|BCP|STD|FYI)['"]/i)
              .map { |v, n| "#{n.upcase} #{v}" }
  ids << anchor.to_s if ids.empty? && anchor && !anchor.empty?
  primary_id = ids.find { |i| i.start_with?("RFC ") } || ids.first
  {
    "docidentifier" => ids.uniq.map do |d|
      { "content" => d, "type" => "IETF", "primary" => d == primary_id }
    end,
    "title" => [{ "content" => text[/<title[^>]*>([^<]+)<\/title>/m, 1]&.strip, "type" => "main" }],
    "date" => [{ "type" => "published", "at" => text[/<date[^>]*\syear=['"](\d{4})['"]/i, 1] }],
    "type" => "standard",
  }
end

# Bounded memory: only the current chunk's rows and blobs are held; the
# rest is flushed to chunk files as the run proceeds. Accumulating every
# record OOMs the 7 GB runners on the big corpora (ietf 179k, iso 80k,
# 3gpp 89k, itu) — those jobs died to runner shutdowns on every run.
rows = []
blobs = {}
errors = 0
chunk_index = 0
docs_written = 0

files.each_with_index do |path, idx|
  rel = path.delete_prefix("#{options[:repo]}/")
  r2_key = "#{options[:flavor]}/#{File.join(File.dirname(rel), File.basename(rel, ".*"))}"

  begin
    text = File.read(path, encoding: "UTF-8")
    doc = path.end_with?(".xml") ? ietf_xml_meta(text) : (YAML.safe_load(text, aliases: true) || {})
  rescue StandardError => e
    warn "  [skip] #{rel}: #{e.class}: #{e.message}"
    errors += 1
    next
  end

  # Newer schema (v1.5+): docidentifier[]/{content,type}; older (v1.2): docid[]/{id,type}
  docid_list = (doc["docidentifier"] || doc["docid"] || []).map do |d|
    { "content" => d["content"] || d["id"], "type" => d["type"], "primary" => d["primary"] }
  end
  primary = docid_list.find { |d| d["primary"] } || docid_list.first || {}

  begin
    xml = xml_for(doc, text, options[:flavor], path)
  rescue StandardError => e
    warn "  [skip] #{rel}: #{e.class}: #{e.message}"
    errors += 1
    next
  end
  titles = doc["title"] || []
  main_title = titles.find { |t| t.is_a?(Hash) && t["type"] == "main" && t["language"] == "en" } ||
               titles.find { |t| t.is_a?(Hash) && t["type"] == "main" } ||
               titles.first
  published = (doc["date"] || []).find { |d| d.is_a?(Hash) && d["type"] == "published" }&.[]("at") ||
              (doc["date"] || []).find { |d| d.is_a?(Hash) && d["type"] == "published" }&.[]("value")

  abstract = (doc["abstract"] || []).map { |a| a.is_a?(Hash) ? a["content"].to_s.gsub(/<[^>]+>/, "").strip : a.to_s }
                                    .find { |a| !a.empty? }
  abstract = nil if abstract.to_s.empty?

  norm, undated_norm, allparts_norm = derive_keys(primary["content"].to_s, options[:flavor])
  year = primary["content"].to_s[/:(\d{4})(?=[^-]*$)/, 1] || published.to_s[0, 4]

  canonicals = pubid_canonicals(docid_list, options[:flavor])
  # 3GPP ids carry release/series suffixes (":REL-19/19.0.0", ":UMTS/3.0.0");
  # index the bare form too so "3GPP TS 23.040" resolves to the latest release.
  bare_release = primary["content"].to_s.sub(/\A(3GPP [A-Z]{2} [\d.]+[A-Z]*)(?::[A-Z]+(?:-\d+)?\/.*)?\z/) { Regexp.last_match(1) }
  canonicals << bare_release if bare_release =~ /\A3GPP / && bare_release != primary["content"]
  all_ids = docid_list.map do |d|
    next unless d.is_a?(Hash)
    { norm: d["content"].to_s.upcase.delete(" "), raw: d["content"], type: d["type"] }
  end.compact + canonicals.map do |c|
    { norm: c.upcase.delete(" "), raw: c, type: "canonical" }
  end

  components = pubid_components(primary["content"].to_s, options[:flavor])
  rows << {
    file_path: rel,
    r2_key: r2_key,
    docid: primary["content"],
    norm: norm,
    undated_norm: undated_norm,
    allparts_norm: allparts_norm,
    year: year&.to_i,
    published: published,
    title_en: main_title && main_title["content"],
    doctype: doc["type"],
    status: extract_status(doc["status"]),
    abstract: abstract,
    publisher: components[:publisher],
    number: components[:number],
    part: components[:part],
    edition: components[:edition],
    docids: all_ids.map { |h| h.merge(norm: h[:norm].upcase.delete(" ")) }
                    .filter_map { |h| h[:norm].empty? ? nil : h }.uniq { |h| h[:norm] },
  }
  blobs[r2_key] = xml

  puts "#{idx + 1}/#{files.size} #{rel}" if ((idx + 1) % 1000).zero?

  next unless rows.size >= options[:chunk_size]

  File.binwrite(File.join(out_dir, format("chunk-%04d.json", chunk_index)),
                JSON.generate(chunk_payload(options[:flavor], repo, last_modified, rows, blobs, final: false)))
  chunk_index += 1
  docs_written += rows.size
  rows = []
  blobs = {}
end

# The final chunk closes the run (the API's finalize step keys on it); it is
# written even when empty so a fully-skipped run still terminates cleanly.
File.binwrite(File.join(out_dir, format("chunk-%04d.json", chunk_index)),
              JSON.generate(chunk_payload(options[:flavor], repo, last_modified, rows, blobs, final: true)))
docs_written += rows.size

puts "wrote #{chunk_index + 1} chunk(s) to #{out_dir} (#{docs_written} docs, #{errors} skipped)"
