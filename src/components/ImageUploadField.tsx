import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
}

export default function ImageUploadField({ label, value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Solo se permiten imágenes'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Máximo 5 MB'); return; }

    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from('product-images').upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }

    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
    toast.success('Imagen subida');
  };

  return (
    <div>
      <label className="app-label">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          className="app-input flex-1"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="URL o subí una imagen"
        />
        <button
          type="button"
          className="nav-btn !px-3 !py-2 !text-xs whitespace-nowrap"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '⏳' : '📁 Subir'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
        />
      </div>
      {value && (
        <img src={value} alt="preview" className="mt-2 h-16 w-16 rounded-lg object-cover border border-border" />
      )}
    </div>
  );
}
