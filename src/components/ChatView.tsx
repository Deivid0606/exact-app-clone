import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function ChatView() {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [threads, setThreads] = useState<{ key: string; peer: string; lastMsg: string }[]>([]);
  const [selectedPeer, setSelectedPeer] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const msgRef = useRef<HTMLDivElement>(null);

  const threadKey = (a: string, b: string) => {
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x < y ? `${x}|${y}` : `${y}|${x}`;
  };

  useEffect(() => {
    supabase.from('profiles').select('email, name').then(({ data }) => setContacts(data || []));
  }, []);

  useEffect(() => {
    if (!profile?.email) return;
    // Load threads from DM messages
    supabase.from('chat_dm_messages').select('*').or(`from_email.eq.${profile.email},to_email.eq.${profile.email}`)
      .order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        const map = new Map<string, { peer: string; lastMsg: string }>();
        (data || []).forEach(m => {
          const peer = m.from_email === profile.email ? m.to_email : m.from_email;
          const key = threadKey(profile.email!, peer!);
          if (!map.has(key)) map.set(key, { peer: peer!, lastMsg: m.message_text || '' });
        });
        setThreads(Array.from(map.entries()).map(([key, v]) => ({ key, ...v })));
      });
  }, [profile?.email]);

  const loadMessages = async (peer: string) => {
    if (!profile?.email || !peer) return;
    const key = threadKey(profile.email, peer);
    const { data } = await supabase.from('chat_dm_messages').select('*')
      .eq('thread_key', key).order('created_at', { ascending: true }).limit(100);
    setMessages(data || []);
    setTimeout(() => { if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight; }, 100);
  };

  const selectPeer = (peer: string) => {
    setSelectedPeer(peer);
    loadMessages(peer);
  };

  const send = async () => {
    if (!text.trim() || !selectedPeer || !profile?.email) return;
    const key = threadKey(profile.email, selectedPeer);
    await supabase.from('chat_dm_messages').insert({
      thread_key: key,
      from_email: profile.email,
      to_email: selectedPeer,
      from_role: profile.role,
      message_text: text.trim(),
    });
    setText('');
    loadMessages(selectedPeer);
    toast.success('Mensaje enviado');
  };

  // Poll every 5s
  useEffect(() => {
    if (!selectedPeer) return;
    const iv = setInterval(() => loadMessages(selectedPeer), 5000);
    return () => clearInterval(iv);
  }, [selectedPeer]);

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Chat</h3>
      <div className="flex gap-3" style={{ alignItems: 'stretch' }}>
        {/* Thread list */}
        <div className="app-card !p-3 w-[320px] overflow-auto" style={{ maxHeight: 520 }}>
          <div className="flex justify-between mb-2">
            <b className="text-sm">Conversaciones</b>
          </div>
          <label className="app-label !mt-0">Escribir a</label>
          <select className="app-input mb-2" value={selectedPeer} onChange={e => selectPeer(e.target.value)}>
            <option value="">-- Elegir destinatario --</option>
            {contacts.filter(c => c.email !== profile?.email).map(c => (
              <option key={c.email} value={c.email}>{c.name || c.email} ({c.email})</option>
            ))}
          </select>
          <div className="flex flex-col gap-1">
            {threads.map(t => (
              <button key={t.key} className={`nav-btn text-left text-xs w-full ${selectedPeer === t.peer ? 'active' : ''}`}
                onClick={() => selectPeer(t.peer)}>
                <div className="truncate">{t.peer}</div>
                <div className="text-[10px] text-muted-foreground truncate">{t.lastMsg}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 min-w-[320px] flex flex-col gap-2">
          <div className="app-card !p-3">
            <span className="chip text-[10px]">Chat con</span>
            <div className="font-bold mt-1">{selectedPeer || 'Seleccione un destinatario'}</div>
          </div>

          <div ref={msgRef} className="app-card !p-3 overflow-auto flex-1" style={{ maxHeight: 420 }}>
            {messages.length === 0 && <span className="chip">Elegí un destinatario para empezar.</span>}
            {messages.map(m => {
              const mine = m.from_email?.toLowerCase() === profile?.email?.toLowerCase();
              return (
                <div key={m.id} className={`flex mb-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className="app-card !p-2.5 max-w-[75%] !rounded-[14px]">
                    <div className="chip text-[10px]">{m.from_role} · {m.from_email}</div>
                    <div className="mt-1 text-sm">{m.message_text}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {m.created_at ? new Date(m.created_at).toLocaleString('es-PY') : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input className="app-input flex-1" placeholder="Escribí tu mensaje..." value={text}
              onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
            <button className="nav-btn active" onClick={send}>Enviar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
