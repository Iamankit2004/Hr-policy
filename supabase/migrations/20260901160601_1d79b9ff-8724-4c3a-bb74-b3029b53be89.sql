CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  raw_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'processing',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX documents_checksum_key ON public.documents (checksum);
CREATE UNIQUE INDEX documents_filename_key ON public.documents (lower(filename));

CREATE TABLE public.document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chunk_key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  section TEXT,
  subsection TEXT,
  heading_path TEXT,
  page_number INTEGER,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX document_chunks_document_id_idx ON public.document_chunks (document_id);
CREATE INDEX document_chunks_embedding_idx ON public.document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX document_chunks_fts_idx ON public.document_chunks USING gin (to_tsvector('english', coalesce(heading_path,'') || ' ' || content));

CREATE TABLE public.query_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  status TEXT NOT NULL,
  top_score REAL,
  chunks_considered INTEGER NOT NULL DEFAULT 0,
  citations_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.documents TO service_role;
GRANT ALL ON public.document_chunks TO service_role;
GRANT ALL ON public.query_logs TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.match_policy_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 12
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  chunk_key text,
  filename text,
  heading_path text,
  section text,
  subsection text,
  page_number int,
  content text,
  version int,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.document_id, c.chunk_key, d.filename, c.heading_path, c.section,
         c.subsection, c.page_number, c.content, c.version,
         (1 - (c.embedding <=> query_embedding))::real AS similarity
  FROM public.document_chunks c
  JOIN public.documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL AND d.status = 'indexed'
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.keyword_policy_chunks(
  query_text text,
  match_count int DEFAULT 12
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  chunk_key text,
  filename text,
  heading_path text,
  section text,
  subsection text,
  page_number int,
  content text,
  version int,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.document_id, c.chunk_key, d.filename, c.heading_path, c.section,
         c.subsection, c.page_number, c.content, c.version,
         ts_rank(to_tsvector('english', coalesce(c.heading_path,'') || ' ' || c.content),
                 websearch_to_tsquery('english', query_text))::real AS rank
  FROM public.document_chunks c
  JOIN public.documents d ON d.id = c.document_id
  WHERE d.status = 'indexed'
    AND to_tsvector('english', coalesce(c.heading_path,'') || ' ' || c.content)
        @@ websearch_to_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_policy_chunks(vector, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.keyword_policy_chunks(text, int) FROM anon, authenticated;