-- 0013: the identifier-grade fuzzy lane (relaton-api-js#165). The main
-- FTS index (0009) ranks words; identifier queries are short, structured,
-- and typo-prone ("IS0 3166", "ISO 19115-"). The trigram tokenizer makes
-- substring-and-typo matching work over the same columns the exact lanes
-- use. Queried only when the exact/normalized lanes return too few hits,
-- ranked below them, so it never pollutes exact matches. External-content
-- like 0009: rebuilt wholesale by the bulk import's rebuild statement.
CREATE VIRTUAL TABLE documents_search_trigram USING fts5(
  docid,
  title,
  norm,
  content='documents_search',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER documents_search_trigram_ai AFTER INSERT ON documents_search BEGIN
  INSERT INTO documents_search_trigram(rowid, docid, title, norm)
  VALUES (new.rowid, new.docid, new.title, new.norm);
END;

CREATE TRIGGER documents_search_trigram_ad AFTER DELETE ON documents_search BEGIN
  INSERT INTO documents_search_trigram(documents_search_trigram, rowid, docid, title, norm)
  VALUES ('delete', old.rowid, old.docid, old.title, old.norm);
END;

CREATE TRIGGER documents_search_trigram_au AFTER UPDATE OF docid, title, norm ON documents_search BEGIN
  INSERT INTO documents_search_trigram(documents_search_trigram, rowid, docid, title, norm)
  VALUES ('delete', old.rowid, old.docid, old.title, old.norm);
  INSERT INTO documents_search_trigram(rowid, docid, title, norm)
  VALUES (new.rowid, new.docid, new.title, new.norm);
END;
