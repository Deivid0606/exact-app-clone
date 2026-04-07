import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type ChatTab = 'general' | 'dm';

export default function ChatView() {
  const { profile } = useAuth();
  const myEmail = profile?.email || '';
  const myRole = profile?.role || '';

  const [tab, setTab] = useState<ChatTab>('general');
  const [contacts, setContacts] = useState<{ email: string; name: string | null; role: string | null }[]>([]);
  const [text, setText] = useState('');
  const msgRef = useRef<HTMLDivElement>(null);

  // General chat state
  const [generalMessages, setGeneralMessages] = useState<any[]>([]);

  // DM state
  const [selectedPeer, setSelectedPeer] = useState('');
  const [dmMessages, setDmMessages] = useState<any[]>([]);
  const [threads, setThreads] = useState<{ key: string; peer: string; peerName: string; lastMsg: string; lastTime: string }[]>([]);

  const threadKey = (a: string, b: string) => {
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x < y ? `${x}|${y}` : `${y}|${x}`;
  };

  // Load contacts with roles
  useEffect(() => {
    const loadContacts = async () => {
      const [profRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('email, name, user_id'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      const roleMap = new Map<string, string>();
      (rolesRes.data || []).forEach(r => roleMap.set(r.user_id, r.role));
      const list = (profRes.data || []).map(p => ({
        email: p.email,
        name: p.name,
        role: roleMap.get(p.user_id) || null,
      }));
      setContacts(list);
    };
    loadContacts();
  }, []);

  const contactMap = useMemo(() => {
    const m: Record<string, { name: string; role: string }> = {};
    contacts.forEach(c => { m[c.email.toLowerCase()] = { name: c.name || c.email, role: c.role || '' }; });
    return m;
  }, [contacts]);

  // Load general chat
  const loadGeneral = async () => {
    const { data } = await supabase.from('chat_messages').select('*')
      .order('created_at', { ascending: true }).limit(200);
    setGeneralMessages(data || []);
    scrollBottom();
  };

  // Load DM threads
  const loadThreads = async () => {
    if (!myEmail) return;
    const { data } = await supabase.from('chat_dm_messages').select('*')
      .or(`from_email.eq.${myEmail},to_email.eq.${myEmail}`)
      .order('created_at', { ascending: false }).limit(500);
    const map = new Map<string, { peer: string; lastMsg: string; lastTime: string }>();
    (data || []).forEach(m => {
      const peer = m.from_email?.toLowerCase() === myEmail.toLowerCase() ? m.to_email : m.from_email;
      const key = threadKey(myEmail, peer!);
      if (!map.has(key)) map.set(key, { peer: peer!, lastMsg: m.message_text || '', lastTime: m.created_at });
    });
    setThreads(Array.from(map.entries()).map(([key, v]) => ({
      key, peer: v.peer,
      peerName: contactMap[v.peer.toLowerCase()]?.name || v.peer,
      lastMsg: v.lastMsg, lastTime: v.lastTime,
    })));
  };

  // Load DM messages
  const loadDmMessages = async (peer: string) => {
    if (!myEmail || !peer) return;
    const key = threadKey(myEmail, peer);
    const { data } = await supabase.from('chat_dm_messages').select('*')
      .eq('thread_key', key).order('created_at', { ascending: true }).limit(200);
    setDmMessages(data || []);
    scrollBottom();
  };

  const scrollBottom = () => {
    setTimeout(() => { if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight; }, 100);
  };

  useEffect(() => { loadGeneral(); loadThreads(); }, [myEmail]);

  // Poll
  useEffect(() => {
    const iv = setInterval(() => {
      if (tab === 'general') loadGeneral();
      else { loadThreads(); if (selectedPeer) loadDmMessages(selectedPeer); }
    }, 5000);
    return () => clearInterval(iv);
  }, [tab, selectedPeer]);

  const selectPeer = (peer: string) => {
    setSelectedPeer(peer);
    loadDmMessages(peer);
  };

  const sendGeneral = async () => {
    if (!text.trim() || !myEmail) return;
    await supabase.from('chat_messages').insert({
      sender_email: myEmail,
      sender_role: myRole,
      message_text: text.trim(),
    });
    setText('');
    loadGeneral();
  };

  const sendDm = async () => {
    if (!text.trim() || !selectedPeer || !myEmail) return;
    const key = threadKey(myEmail, selectedPeer);
    await supabase.from('chat_dm_messages').insert({
      thread_key: key,
      from_email: myEmail,
      to_email: selectedPeer,
      from_role: myRole,
      message_text: text.trim(),
    });
    setText('');
    loadDmMessages(selectedPeer);
    loadThreads();
  };

  const send = () => tab === 'general' ? sendGeneral() : sendDm();
  const messages = tab === 'general' ? generalMessages : dmMessages;

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-3">Chat</h3>

      {/* Tab buttons */}
      <div className="flex gap-2 mb-3">
        <button className={`nav-btn ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>💬 Chat General</button>
        <button className={`nav-btn ${tab === 'dm' ? 'active' : ''}`} onClick={() => setTab('dm')}>📩 Mensajes Directos</button>
      </div>

      <div className="flex gap-3" style={{ alignItems: 'stretch' }}>
        {/* Sidebar */}
        {tab === 'dm' && (
          <div className="app-card !p-3 w-[300px] overflow-auto shrink-0" style={{ maxHeight: 520 }}>
            <div className="flex justify-between items-center mb-2">
              <b className="text-sm">Conversaciones</b>
              <button className="nav-btn !px-2 !py-1 !text-[10px]" onClick={loadThreads}>↻</button>
            </div>
            <label className="app-label !mt-0">Escribir a</label>
            <select className="app-input mb-2" value={selectedPeer} onChange={e => selectPeer(e.target.value)}>
              <option value="">-- Elegir destinatario --</option>
              {contacts.filter(c => c.email !== myEmail).map(c => (
                <option key={c.email} value={c.email}>
                  {c.role ? `${c.role} · ` : ''}{c.name || c.email}
                </option>
              ))}
            </select>
            <div className="flex flex-col gap-1">
              {threads.map(t => (
                <button key={t.key} className={`nav-btn text-left text-xs w-full ${selectedPeer === t.peer ? 'active' : ''}`}
                  onClick={() => selectPeer(t.peer)}>
                  <div className="flex justify-between items-center">
                    <span className="truncate font-bold">{t.peerName}</span>
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap ml-1">
                      {t.lastTime ? new Date(t.lastTime).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{t.lastMsg}</div>
                </button>
              ))}
              {threads.length === 0 && <span className="text-xs text-muted-foreground">Sin conversaciones aún</span>}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 min-w-[320px] flex flex-col gap-2">
          <div className="app-card !p-3">
            {tab === 'general' ? (
              <div className="font-bold text-sm">💬 Chat general — todos los usuarios</div>
            ) : (
              <>
                <span className="chip text-[10px]">Chat con</span>
                <div className="font-bold mt-1">
                  {selectedPeer ? (contactMap[selectedPeer.toLowerCase()]?.name || selectedPeer) : 'Seleccione un destinatario'}
                  {selectedPeer && contactMap[selectedPeer.toLowerCase()]?.role && (
                    <span className="chip text-[9px] ml-2">{contactMap[selectedPeer.toLowerCase()].role}</span>
                  )}
                </div>
              </>
            )}
          </div>

          <div ref={msgRef} className="app-card !p-3 overflow-auto flex-1" style={{ maxHeight: 420, minHeight: 300 }}>
            {messages.length === 0 && (
              <span className="chip">{tab === 'general' ? 'Sin mensajes aún. ¡Escribí el primero!' : 'Elegí un destinatario para empezar.'}</span>
            )}
            {messages.map(m => {
              const senderEmail = tab === 'general' ? m.sender_email : m.from_email;
              const senderRole = tab === 'general' ? m.sender_role : m.from_role;
              const mine = senderEmail?.toLowerCase() === myEmail.toLowerCase();
              const senderName = contactMap[senderEmail?.toLowerCase()]?.name || senderEmail;
              return (
                <div key={m.id} className={`flex mb-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`app-card !p-2.5 max-w-[75%] !rounded-[14px] ${mine ? '!border-primary/30' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="chip text-[9px]">{senderRole}</span>
                      <span className="text-[11px] font-bold">{senderName}</span>
                    </div>
                    <div className="mt-1 text-sm">{m.message_text}</div>
                    {m.attachment_url && (
                      <a href={m.attachment_url} target="_blank" rel="noopener" className="text-[11px] text-primary mt-1 block">
                        📎 {m.attachment_name || 'Adjunto'}
                      </a>
                    )}
                    <div className="text-[9px] text-muted-foreground mt-1">
                      {m.created_at ? new Date(m.created_at).toLocaleString('es-PY') : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input className="app-input flex-1" placeholder="Escribí tu mensaje..."
              value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              disabled={tab === 'dm' && !selectedPeer} />
            <button className="nav-btn active" onClick={send}
              disabled={tab === 'dm' && !selectedPeer}>Enviar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
