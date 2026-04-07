
-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);

-- RLS: Authenticated users can upload
CREATE POLICY "Authenticated can upload chat attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

-- RLS: Anyone can view chat attachments (public bucket)
CREATE POLICY "Public can view chat attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'chat-attachments');

-- Create delivery_locations table for real-time map
CREATE TABLE public.delivery_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_email text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view delivery locations"
ON public.delivery_locations FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Delivery can update own location"
ON public.delivery_locations FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Delivery can upsert own location"
ON public.delivery_locations FOR UPDATE TO authenticated
USING (true);

-- Enable realtime for delivery_locations
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_locations;
