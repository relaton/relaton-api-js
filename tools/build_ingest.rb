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
end.parse!(into: options)

abort "--repo is required" unless options[:repo]
abort "--flavor is required" unless options[:flavor]

out_dir = options[:out] || File.join("out", options[:flavor])
FileUtils.mkdir_p(out_dir)

require "relaton"
require "relaton/bib/hash_parser_v1"
require "relaton/bib/item_data"
require "pubid"

registry = Relaton::Db::Registry.instance

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
      id = mod.parse(code)
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

PUBID_FLAVORS = {
  "iso" => :Iso, "iec" => :Iec, "ieee" => :Ieee, "itu" => :Itu,
  "nist" => :Nist, "iho" => :Iho, "bsi" => :Bsi, "jis" => :Jis,
  "ccsds" => :Ccsds, "etsi" => :Etsi, "plateau" => :Plateau,
}.freeze

def pubid_module(flavor)
  mod_name = PUBID_FLAVORS[flavor]
  return nil unless mod_name

  require "pubid/#{flavor}"
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
      mod.parse(d["content"].to_s)
    rescue StandardError
      next
    end
    canonical = id.to_s
    canonical unless canonical.nil? || canonical.empty?
  end.uniq
end

repo = "relaton/relaton-data-#{options[:flavor]}"
files = %w[data static].flat_map { |d| Dir[File.join(options[:repo], d, "**", "*.{yaml,xml}")] }.sort
files = files.first(options[:limit]) if options[:limit]
abort "no yaml files under #{options[:repo]}/{data,static}" if files.empty?

last_modified =
  begin
    File.read(File.join(options[:repo], "last_modified.txt")).strip
  rescue StandardError
    nil
  end

# Versioned identifiers also index their bare form: ETSI
# "GS QKD 014 V1.1.1 (2019-02)" <- "GS QKD 014"; NIST "800-53r5" <-
# "800-53"; ITU "G.7710 (11/2025)" <- "G.7710". Same role as the 3GPP
# release-suffix rule below.
def bare_variants(docid)
  variants = []
  v = docid.sub(/\s*V\d+(?:\.\d+)*(?:\s*\((?:19|20)\d{2}(?:-\d{2})?\))?\z/, "")
  variants << v if v != docid && !v.strip.empty?
  r = docid.sub(/r\d+\z/i, "")
  variants << r if r != docid && !r.strip.empty?
  itu = docid.sub(/\s*\(\d{2}\/(?:19|20)\d{2}\)\z/, "")
  variants << itu if itu != docid && !itu.strip.empty?
  clean = docid.sub(/[:\s]+\z/, "")
  variants << clean if clean != docid && !clean.empty?
  variants.uniq
end

def extract_status(status)
  case status
  when String then status
  when Hash then status["stage"].is_a?(Hash) ? status["stage"]["value"] : status["stage"]
  end
end

# Old-schema (v1.2.x) docs go through the gem's own v1 hash parser.
# Docs whose prefix no flavor processor claims use the generic Bib model.
def xml_for(doc, text, processor, path)
  if path.end_with?(".xml")
    require "relaton/ietf/bibxml_parser"
    Relaton::Ietf::BibXMLParser.parse(text).to_xml(bibdata: true)
  elsif doc["docid"]
    bib_hash = Relaton::Bib::HashParserV1.hash_to_bib(doc)
    Relaton::Bib::ItemData.new(**bib_hash).to_xml(bibdata: true)
  elsif processor
    begin
      processor.from_yaml(text).to_xml(bibdata: true)
    rescue RuntimeError
      require "relaton/bib/model/item"
      Relaton::Bib::Item.from_yaml(text).to_xml(bibdata: true)
    end
  else
    require "relaton/bib/model/item"
    Relaton::Bib::Item.from_yaml(text).to_xml(bibdata: true)
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

def write_chunk(flavor:, repo:, rows:, out_dir:, index:, last_modified:, final:)
  payload = {
    flavor: flavor,
    repo: repo,
    final: final,
    lastModified: last_modified,
    relatonVersion: "data-repos",
    rows: rows.map { |r| r.reject { |k, _| k == :xml } },
    blobs: rows.each_with_object({}) { |r, h| h[r[:r2_key]] = r[:xml] },
  }
  File.binwrite(File.join(out_dir, format("chunk-%04d.json", index)), JSON.generate(payload))
end

rows = []
errors = 0
written = 0
chunk_size = options[:chunk_size]

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
    processor = registry.processor_by_ref(primary["content"].to_s)
    xml = xml_for(doc, text, processor, path)
  rescue StandardError => e
    warn "  [skip] #{rel}: #{e.class}: #{e.message}"
    errors += 1
    next
  end
  titles = doc["title"] || []
  main_title = titles.find { |t| t["type"] == "main" && t["language"] == "en" } ||
               titles.find { |t| t["type"] == "main" } ||
               titles.first
  published = (doc["date"] || []).find { |d| d["type"] == "published" }&.[]("at") ||
              (doc["date"] || []).find { |d| d["type"] == "published" }&.[]("value")

  norm, undated_norm, allparts_norm = derive_keys(primary["content"].to_s, options[:flavor])
  year = primary["content"].to_s[/:(\d{4})(?=[^-]*$)/, 1] || published.to_s[0, 4]

  canonicals = pubid_canonicals(docid_list, options[:flavor])
  canonicals.concat(bare_variants(primary["content"].to_s))
  # 3GPP ids carry release/series suffixes (":REL-19/19.0.0", ":UMTS/3.0.0");
  # index the bare form too so "3GPP TS 23.040" resolves to the latest release.
  bare_release = primary["content"].to_s.sub(/\A(3GPP [A-Z]{2} [\d.]+[A-Z]*)(?::[A-Z]+(?:-\d+)?\/.*)?\z/) { Regexp.last_match(1) }
  canonicals << bare_release if bare_release =~ /\A3GPP / && bare_release != primary["content"]
  all_ids = docid_list.map do |d|
    { norm: d["content"].to_s.upcase.delete(" "), raw: d["content"], type: d["type"] }
  end + canonicals.map do |c|
    { norm: c.upcase.delete(" "), raw: c, type: "canonical" }
  end

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
    docids: all_ids.map { |h| h.merge(norm: h[:norm].upcase.delete(" ")) }
                    .filter_map { |h| h[:norm].empty? ? nil : h }.uniq { |h| h[:norm] },
  }
  rows.last[:xml] = xml

  puts "#{idx + 1}/#{files.size} #{rel}" if ((idx + 1) % 1000).zero?

  if rows.size == chunk_size
    write_chunk(flavor: options[:flavor], repo: repo, rows: rows, out_dir: out_dir,
                index: written, last_modified: last_modified, final: false)
    written += 1
    rows = []
  end
end

write_chunk(flavor: options[:flavor], repo: repo, rows: rows, out_dir: out_dir,
            index: written, last_modified: last_modified, final: true)

puts "wrote #{written + 1} chunk(s) to #{out_dir} (docs: #{written * chunk_size + rows.size}, #{errors} skipped)"
