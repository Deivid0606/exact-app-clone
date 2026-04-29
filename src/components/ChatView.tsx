import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type ChannelKey =
  | 'general'
  | 'consulta_comisiones'
  | 'comprobantes_transferencias'
  | 'reclamos_garantias'
  | 'consultas_estados'
  | 'fotos_productos';

type ChatTab = ChannelKey | 'dm';

type Contact = {
  email: string;
  name: string | null;
  role: string | null;
};

type ChatChannel = {
  id?: string;
  channel_key: ChannelKey;
  title: string;
  logo_url: string | null;
};

type Attachment = {
  url: string;
  name: string;
  type: 'image' | 'audio' | 'file';
  mime: string;
};

type ChatMessage = {
  id: string;
  sender_email?: string | null;
  sender_role?: string | null;
  from_email?: string | null;
  from_role?: string | null;
  to_email?: string | null;
  thread_key?: string | null;
  message_text: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type?: string | null;
  attachment_mime?: string | null;
  channel_key?: string | null;
  created_at: string;
  read_at?: string | null;
  deleted_for?: string[] | null;
};

type Thread = {
  key: string;
  peer: string;
  peerName: string;
  lastMsg: string;
  lastTime: string;
  unread: number;
};

const FALLBACK_CHANNELS: ChatChannel[] = [
  { channel_key: 'general', title: 'Chat General', logo_url: null },
  { channel_key: 'consulta_comisiones', title: 'Consulta de comisiones', logo_url: null },
  {
    channel_key: 'comprobantes_transferencias',
    title: 'Comprobantes de transferencias para encomienda',
    logo_url: null,
  },
  { channel_key: 'reclamos_garantias', title: 'Reclamos y garantías', logo_url: null },
  { channel_key: 'consultas_estados', title: 'Consultas de estados', logo_url: null },
  { channel_key: 'fotos_productos', title: 'Fotos de productos', logo_url: null },
];

const EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🔥', '📦', '✅', '⚠️', '💰', '🚚', '🧾'];

function getAttachmentType(file: File): Attachment['type'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

function inferAttachmentType(message: ChatMessage): Attachment['type'] {
  if (message.attachment_type === 'image') return 'image';
  if (message.attachment_type === 'audio') return 'audio';

  const name = (message.attachment_name || message.attachment_url || '').toLowerCase();

  if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)$/.test(name)) return 'image';
  if (/\.(mp3|wav|ogg|webm|m4a|aac)$/.test(name)) return 'audio';

  return 'file';
}

function formatTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('es-PY', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-PY');
}

export default function ChatView() {
  const { profile } = useAuth();

  const myEmail = profile?.email || '';
  const myRole = profile?.role || '';
  const isApproved = Boolean(profile?.approved);

  const canEditChannelLogo =
    isApproved && (myRole === 'ADMIN' || myRole === 'PROVEEDOR');

  const [tab, setTab] = useState<ChatTab>('general');
  const [channels, setChannels] = useState<ChatChannel[]>(FALLBACK_CHANNELS);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);

  const [channelMessages, setChannelMessages] = useState<ChatMessage[]>([]);
  const [selectedPeer, setSelectedPeer] = useState('');
  const [dmMessages, setDmMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);

  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const msgRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingChannelRef = useRef<any>(null);

  const activeChannel = useMemo(() => {
    if (tab === 'dm') return null;
    return channels.find((channel) => channel.channel_key === tab) || FALLBACK_CHANNELS[0];
  }, [channels, tab]);

  const contactMap = useMemo(() => {
    const map: Record<string, { name: string; role: string }> = {};

    contacts.forEach((contact) => {
      map[contact.email.toLowerCase()] = {
        name: contact.name || contact.email,
        role: contact.role || '',
      };
    });

    return map;
  }, [contacts]);

  // Función para verificar si puede escribir a un destinatario
  const canSendToPeer = (peerEmail: string): boolean => {
    if (!myEmail || !peerEmail) return false;
    
    const peer = contacts.find(c => c.email.toLowerCase() === peerEmail.toLowerCase());
    if (!peer) return true;
    
    const peerRole = peer.role;
    const myRoleUpper = myRole?.toUpperCase();
    
    // VENDEDOR solo puede escribir a PROVEEDOR
    if (myRoleUpper === 'VENDEDOR') {
      return peerRole === 'PROVEEDOR';
    }
    
    // PROVEEDOR puede escribir a VENDEDOR (y a otros)
    if (myRoleUpper === 'PROVEEDOR') {
      return true;
    }
    
    // ADMIN y DESPACHANTE pueden escribir a todos
    if (myRoleUpper === 'ADMIN' || myRoleUpper === 'DESPACHANTE') {
      return true;
    }
    
    return true;
  };

  // Función para verificar si puede VER un chat (solo los participantes)
  const canViewChat = (peerEmail: string): boolean => {
    if (!myEmail || !peerEmail) return false;
    
    const myRoleUpper = myRole?.toUpperCase();
    
    // ADMIN y DESPACHANTE pueden ver todos los chats
    if (myRoleUpper === 'ADMIN' || myRoleUpper === 'DESPACHANTE') {
      return true;
    }
    
    const peer = contacts.find(c => c.email.toLowerCase() === peerEmail.toLowerCase());
    const peerRole = peer?.role;
    
    // VENDEDOR solo puede ver chats con PROVEEDOR
    if (myRoleUpper === 'VENDEDOR') {
      return peerRole === 'PROVEEDOR';
    }
    
    // PROVEEDOR puede ver chats con VENDEDOR
    if (myRoleUpper === 'PROVEEDOR') {
      return peerRole === 'VENDEDOR' || peerRole === 'PROVEEDOR' || peerRole === 'ADMIN' || peerRole === 'DESPACHANTE';
    }
    
    return true;
  };

  // Filtrar contactos basado en el rol del usuario actual
  const filteredContacts = useMemo(() => {
    if (!myRole) return [];
    
    const myRoleUpper = myRole.toUpperCase();
    
    // ADMIN, PROVEEDOR y DESPACHANTE ven todos
    if (myRoleUpper === 'ADMIN' || myRoleUpper === 'PROVEEDOR' || myRoleUpper === 'DESPACHANTE') {
      return contacts.filter((contact) => contact.email !== myEmail);
    }
    
    // VENDEDOR solo ve PROVEEDOR
    if (myRoleUpper === 'VENDEDOR') {
      return contacts.filter(
        (contact) => contact.email !== myEmail && contact.role === 'PROVEEDOR'
      );
    }
    
    return contacts.filter((contact) => contact.email !== myEmail);
  }, [contacts, myEmail, myRole]);

  // Filtrar hilos de conversación que el usuario puede ver
  const visibleThreads = useMemo(() => {
    return threads.filter(thread => canViewChat(thread.peer));
  }, [threads, myEmail]);

  // Filtrar mensajes eliminados para el usuario actual
  const filterDeletedMessages = (messages: ChatMessage[]): ChatMessage[] => {
    if (!myEmail) return messages;
    return messages.filter(msg => !msg.deleted_for?.includes(myEmail));
  };

  const messages = useMemo(() => {
    const rawMessages = tab === 'dm' ? dmMessages : channelMessages;
    return filterDeletedMessages(rawMessages);
  }, [tab, dmMessages, channelMessages, myEmail]);

  const channelPreviewMessages = useMemo(() => {
    return filterDeletedMessages(channelMessages.slice(-6)).reverse();
  }, [channelMessages, myEmail]);

  const threadKey = (a: string, b: string) => {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? `${x}|${y}` : `${y}|${x}`;
  };

  const scrollBottom = () => {
    setTimeout(() => {
      if (msgRef.current) {
        msgRef.current.scrollTop = msgRef.current.scrollHeight;
      }
    }, 100);
  };

  const getLastSeenKey = (channelKey: string) => `chat_last_seen_${myEmail}_${channelKey}`;

  const markChannelSeenLocal = (channelKey: string) => {
    if (!myEmail) return;

    localStorage.setItem(getLastSeenKey(channelKey), new Date().toISOString());
    setUnreadByChannel((prev) => ({ ...prev, [channelKey]: 0 }));
  };

  const loadChannels = async () => {
    const { data, error } = await (supabase as any)
      .from('chat_channels')
      .select('*')
      .order('created_at', { ascending: true });

    if (error || !data?.length) {
      setChannels(FALLBACK_CHANNELS);
      return;
    }

    setChannels(
      data.map((item: any) => ({
        id: item.id,
        channel_key: item.channel_key as ChannelKey,
        title: item.title,
        logo_url: item.logo_url || null,
      })),
    );
  };

  const loadContacts = async () => {
    const [profRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('email, name, user_id'),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    const roleMap = new Map<string, string>();

    (rolesRes.data || []).forEach((role: any) => {
      roleMap.set(role.user_id, role.role);
    });

    setContacts(
      (profRes.data || []).map((person: any) => ({
        email: person.email,
        name: person.name,
        role: roleMap.get(person.user_id) || null,
      })),
    );
  };

  const loadChannelMessages = async (channelKey: ChannelKey) => {
    const { data, error } = await (supabase as any)
      .from('chat_messages')
      .select('*')
      .eq('channel_key', channelKey)
      .order('created_at', { ascending: true })
      .limit(250);

    if (error) {
      console.error(error);
      toast.error('No se pudieron cargar los mensajes del canal');
      return;
    }

    setChannelMessages(data || []);
    scrollBottom();
  };

  const loadUnreadCounts = async () => {
    if (!myEmail) return;

    const next: Record<string, number> = {};

    await Promise.all(
      channels.map(async (channel) => {
        const lastSeen = localStorage.getItem(getLastSeenKey(channel.channel_key));

        let query = (supabase as any)
          .from('chat_messages')
          .select('id, sender_email, created_at, deleted_for')
          .eq('channel_key', channel.channel_key)
          .neq('sender_email', myEmail);

        if (lastSeen) {
          query = query.gt('created_at', lastSeen);
        }

        const { data, error } = await query;

        if (!error) {
          const notDeletedForMe = data?.filter(msg => !msg.deleted_for?.includes(myEmail)) || [];
          next[channel.channel_key] = notDeletedForMe.length || 0;
        }
      }),
    );

    setUnreadByChannel(next);
  };

  const loadThreads = async () => {
    if (!myEmail) return;

    const { data, error } = await (supabase as any)
      .from('chat_dm_messages')
      .select('*')
      .or(`from_email.eq.${myEmail},to_email.eq.${myEmail}`)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error(error);
      return;
    }

    // Filtrar mensajes eliminados para este usuario
    const notDeletedForMe = data?.filter(msg => !msg.deleted_for?.includes(myEmail)) || [];

    const map = new Map<string, Thread>();

    notDeletedForMe.forEach((message: ChatMessage) => {
      const peer =
        message.from_email?.toLowerCase() === myEmail.toLowerCase()
          ? message.to_email
          : message.from_email;

      if (!peer) return;

      const key = threadKey(myEmail, peer);

      if (!map.has(key)) {
        // Verificar si el usuario puede ver este hilo
        if (!canViewChat(peer)) return;

        const unread = notDeletedForMe.filter(
          (item: ChatMessage) =>
            item.thread_key === key &&
            item.to_email?.toLowerCase() === myEmail.toLowerCase() &&
            !item.read_at,
        ).length;

        map.set(key, {
          key,
          peer,
          peerName: contactMap[peer.toLowerCase()]?.name || peer,
          lastMsg: message.message_text || message.attachment_name || 'Adjunto',
          lastTime: message.created_at,
          unread,
        });
      }
    });

    setThreads(Array.from(map.values()));
  };

  const loadDmMessages = async (peer: string) => {
    if (!myEmail || !peer) return;

    // Verificar que el usuario puede ver este chat
    if (!canViewChat(peer)) {
      toast.error('No tenés permiso para ver esta conversación');
      setSelectedPeer('');
      return;
    }

    const key = threadKey(myEmail, peer);

    const { data, error } = await (supabase as any)
      .from('chat_dm_messages')
      .select('*')
      .eq('thread_key', key)
      .order('created_at', { ascending: true })
      .limit(250);

    if (error) {
      console.error(error);
      toast.error('No se pudieron cargar los mensajes directos');
      return;
    }

    setDmMessages(data || []);
    scrollBottom();

    await (supabase as any)
      .from('chat_dm_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_key', key)
      .eq('to_email', myEmail)
      .is('read_at', null);

    loadThreads();
  };

  const selectPeer = (peer: string) => {
    // Verificar permiso antes de seleccionar
    if (peer && !canSendToPeer(peer)) {
      toast.error('No tenés permiso para escribirle a este destinatario');
      return;
    }
    setSelectedPeer(peer);
    if (peer) loadDmMessages(peer);
  };

  const handleFileUpload = async (file: File): Promise<Attachment | null> => {
    setUploading(true);

    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${myEmail || 'anon'}/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}_${safeName}`;

      const { error } = await supabase.storage.from('chat-attachments').upload(path, file);

      if (error) {
        console.error(error);
        toast.error('Error subiendo archivo');
        return null;
      }

      const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(path);

      return {
        url: urlData.publicUrl,
        name: file.name,
        type: getAttachmentType(file),
        mime: file.type || 'application/octet-stream',
      };
    } catch (error) {
      console.error(error);
      toast.error('Error subiendo archivo');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!myEmail) return;

    const table = tab === 'dm' ? 'chat_dm_messages' : 'chat_messages';
    
    const { data: currentMessage } = await (supabase as any)
      .from(table)
      .select('deleted_for')
      .eq('id', messageId)
      .single();

    const currentDeletedFor = currentMessage?.deleted_for || [];
    
    if (currentDeletedFor.includes(myEmail)) {
      setShowDeleteConfirm(null);
      return;
    }

    const newDeletedFor = [...currentDeletedFor, myEmail];

    const { error } = await (supabase as any)
      .from(table)
      .update({ deleted_for: newDeletedFor })
      .eq('id', messageId);

    if (error) {
      console.error(error);
      toast.error('No se pudo eliminar el mensaje');
      return;
    }

    toast.success('Mensaje eliminado (solo para vos)');
    setShowDeleteConfirm(null);

    if (tab === 'dm') {
      if (selectedPeer) loadDmMessages(selectedPeer);
      loadThreads();
    } else {
      loadChannelMessages(tab);
      loadUnreadCounts();
    }
  };

  const sendChannelMessage = async (attachment?: Attachment) => {
    if (tab === 'dm') return;
    if (!text.trim() && !attachment) return;
    if (!myEmail) return;

    const { error } = await (supabase as any).from('chat_messages').insert({
      sender_email: myEmail,
      sender_role: myRole,
      message_text: text.trim() || (attachment ? `📎 ${attachment.name}` : ''),
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
      attachment_mime: attachment?.mime || null,
      channel_key: tab,
      deleted_for: [],
    });

    if (error) {
      console.error(error);
      toast.error('No se pudo enviar el mensaje al canal');
      return;
    }

    setText('');
    setShowEmojis(false);
    markChannelSeenLocal(tab);
    loadChannelMessages(tab);
    loadUnreadCounts();
  };

  const sendDm = async (attachment?: Attachment) => {
    if (!text.trim() && !attachment) return;
    if (!selectedPeer || !myEmail) return;

    // Validar permiso antes de enviar
    if (!canSendToPeer(selectedPeer)) {
      toast.error('No tenés permiso para escribirle a este destinatario');
      return;
    }

    const key = threadKey(myEmail, selectedPeer);

    const { error } = await (supabase as any).from('chat_dm_messages').insert({
      thread_key: key,
      from_email: myEmail,
      to_email: selectedPeer,
      from_role: myRole,
      message_text: text.trim() || (attachment ? `📎 ${attachment.name}` : ''),
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
      attachment_mime: attachment?.mime || null,
      read_at: null,
      deleted_for: [],
    });

    if (error) {
      console.error(error);
      toast.error('No se pudo enviar el mensaje directo');
      return;
    }

    setText('');
    setShowEmojis(false);
    loadDmMessages(selectedPeer);
    loadThreads();
  };

  const send = () => {
    if (tab === 'dm') {
      sendDm();
    } else {
      sendChannelMessage();
    }
  };

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const attachment = await handleFileUpload(file);
    if (!attachment) return;

    if (tab === 'dm') {
      await sendDm(attachment);
    } else {
      await sendChannelMessage(attachment);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || tab === 'dm' || !activeChannel) return;

    if (!canEditChannelLogo) {
      toast.error('Solo ADMIN o PROVEEDOR aprobado puede cambiar el logo');
      return;
    }

    setUploading(true);

    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `channel-logos/${activeChannel.channel_key}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file, { upsert: true });

      if (uploadError) {
        console.error(uploadError);
        toast.error('No se pudo subir el logo');
        return;
      }

      const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(path);

      const { error: updateError } = await (supabase as any)
        .from('chat_channels')
        .update({
          logo_url: urlData.publicUrl,
          updated_by: profile?.user_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('channel_key', activeChannel.channel_key);

      if (updateError) {
        console.error(updateError);
        toast.error('No se pudo actualizar el logo del canal');
        return;
      }

      toast.success('Logo actualizado');
      loadChannels();
    } catch (error) {
      console.error(error);
      toast.error('Error actualizando logo');
    } finally {
      setUploading(false);

      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const startRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Tu navegador no permite grabar audio');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `audio_${Date.now()}.webm`, {
          type: 'audio/webm',
        });

        const attachment = await handleFileUpload(file);
        if (!attachment) return;

        if (tab === 'dm') {
          await sendDm(attachment);
        } else {
          await sendChannelMessage(attachment);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      toast.success('Grabando audio...');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo iniciar la grabación');
    }
  };

  const trackTyping = (value: string) => {
    setText(value);

    if (!myEmail || !typingChannelRef.current) return;

    typingChannelRef.current.track({
      email: myEmail,
      name: profile?.name || myEmail,
      typing: true,
    });

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      typingChannelRef.current?.track({
        email: myEmail,
        name: profile?.name || myEmail,
        typing: false,
      });
    }, 1200);
  };

  const renderAttachment = (message: ChatMessage) => {
    if (!message.attachment_url) return null;

    const type = inferAttachmentType(message);

    if (type === 'image') {
      return (
        <a
          href={message.attachment_url}
          target="_blank"
          rel="noreferrer"
          className="chat-attachment chat-attachment-image"
        >
          <img
            src={message.attachment_url}
            alt={message.attachment_name || 'Imagen enviada'}
            className="chat-image-preview"
          />
        </a>
      );
    }

    if (type === 'audio') {
      return (
        <div className="chat-attachment chat-attachment-audio">
          <audio controls src={message.attachment_url}>
            Tu navegador no puede reproducir este audio.
          </audio>
        </div>
      );
    }

    return (
      <a
        href={message.attachment_url}
        target="_blank"
        rel="noreferrer"
        className="chat-attachment chat-attachment-file"
      >
        📎 {message.attachment_name || 'Archivo adjunto'}
      </a>
    );
  };

  const renderMessage = (message: ChatMessage) => {
    const senderEmail = tab === 'dm' ? message.from_email : message.sender_email;
    const senderRole = tab === 'dm' ? message.from_role : message.sender_role;
    const mine = senderEmail?.toLowerCase() === myEmail.toLowerCase();
    const senderName = contactMap[senderEmail?.toLowerCase() || '']?.name || senderEmail;

    return (
      <div key={message.id} className={`chat-message-row ${mine ? 'mine' : 'theirs'}`}>
        <div className="chat-message-bubble">
          <div className="chat-message-meta">
            {senderRole && <span className="chat-role">{senderRole}</span>}
            <strong>{senderName}</strong>
            {mine && (
              <button
                onClick={() => setShowDeleteConfirm(message.id)}
                className="chat-delete-btn"
                title="Eliminar mensaje (solo para vos)"
              >
                🗑️
              </button>
            )}
          </div>

          {message.message_text && <p className="chat-message-text">{message.message_text}</p>}

          {renderAttachment(message)}

          <div className="chat-message-footer">
            <span>{formatDateTime(message.created_at)}</span>

            {tab === 'dm' && mine && (
              <span className="chat-read-state">
                {message.read_at ? '✓✓ Leído' : '✓ Enviado'}
              </span>
            )}
          </div>
        </div>

        {showDeleteConfirm === message.id && (
          <div className="chat-delete-modal-overlay">
            <div className="chat-delete-modal">
              <p>¿Eliminar este mensaje?</p>
              <p className="chat-delete-modal-note">Se eliminará solo para vos. Los demás seguirán viéndolo.</p>
              <div className="chat-delete-modal-buttons">
                <button onClick={() => deleteMessage(message.id)} className="chat-delete-confirm">
                  Eliminar
                </button>
                <button onClick={() => setShowDeleteConfirm(null)} className="chat-delete-cancel">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    loadChannels();
    loadContacts();
  }, []);

  useEffect(() => {
    if (!myEmail) return;

    loadThreads();
    loadUnreadCounts();

    if (tab === 'dm') {
      if (selectedPeer) loadDmMessages(selectedPeer);
    } else {
      loadChannelMessages(tab);
      markChannelSeenLocal(tab);
    }
  }, [myEmail, tab, selectedPeer, channels.length]);

  useEffect(() => {
    if (!myEmail) return;

    const realtimeChannel = supabase
      .channel('chat-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        () => {
          if (tab !== 'dm') {
            loadChannelMessages(tab);
          }

          loadUnreadCounts();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_dm_messages',
        },
        () => {
          loadThreads();

          if (selectedPeer) {
            loadDmMessages(selectedPeer);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [myEmail, tab, selectedPeer]);

  useEffect(() => {
    if (!myEmail) return;

    const typingChannelName =
      tab === 'dm' && selectedPeer
        ? `typing-dm-${threadKey(myEmail, selectedPeer)}`
        : `typing-channel-${tab}`;

    const typingChannel = supabase.channel(typingChannelName, {
      config: {
        presence: {
          key: myEmail,
        },
      },
    });

    typingChannelRef.current = typingChannel;

    typingChannel
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannel.presenceState();

        const users = Object.values(state)
          .flat()
          .filter((item: any) => item.email !== myEmail && item.typing)
          .map((item: any) => item.name || item.email);

        setTypingUsers([...new Set(users)] as string[]);
      })
      .subscribe();

    return () => {
      typingChannel.track({
        email: myEmail,
        name: profile?.name || myEmail,
        typing: false,
      });

      typingChannelRef.current = null;
      setTypingUsers([]);
      supabase.removeChannel(typingChannel);
    };
  }, [myEmail, tab, selectedPeer]);

  return (
    <div className="chat-view">
      <div className="chat-header">
        <h2>Chat</h2>
      </div>

      <div className="chat-tabs">
        {channels.map((channel) => (
          <button
            key={channel.channel_key}
            type="button"
            onClick={() => setTab(channel.channel_key)}
            className={`chat-tab ${tab === channel.channel_key ? 'active' : ''}`}
          >
            <span className="chat-tab-avatar">
              {channel.logo_url ? (
                <img src={channel.logo_url} alt={channel.title} />
              ) : (
                <span>💬</span>
              )}
            </span>

            <span className="chat-tab-title">{channel.title}</span>

            {!!unreadByChannel[channel.channel_key] && (
              <span className="chat-unread-badge">
                {unreadByChannel[channel.channel_key]}
              </span>
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setTab('dm')}
          className={`chat-tab ${tab === 'dm' ? 'active' : ''}`}
        >
          <span className="chat-tab-avatar">📩</span>
          <span className="chat-tab-title">Mensajes Directos</span>
        </button>
      </div>

      <div className="chat-layout">
        <aside className="chat-sidebar">
          {tab === 'dm' ? (
            <>
              {/* Selector de destinatario - SOLO en Mensajes Directos */}
              <div className="chat-dm-selector">
                <label className="chat-label">Escribir a</label>
                <select
                  value={selectedPeer}
                  onChange={(event) => selectPeer(event.target.value)}
                  className="chat-select"
                >
                  <option value="">-- Elegir destinatario --</option>
                  {filteredContacts.map((contact) => (
                    <option key={contact.email} value={contact.email}>
                      {contact.role ? `${contact.role} · ` : ''}
                      {contact.name || contact.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="chat-sidebar-header">
                <strong>Conversaciones</strong>
                <button type="button" onClick={loadThreads}>
                  ↻
                </button>
              </div>

              <div className="chat-thread-list">
                {visibleThreads.map((thread) => (
                  <button
                    key={thread.key}
                    type="button"
                    onClick={() => selectPeer(thread.peer)}
                    className={`chat-thread ${selectedPeer === thread.peer ? 'active' : ''}`}
                  >
                    <div className="chat-thread-top">
                      <strong>{thread.peerName}</strong>
                      <span>{formatTime(thread.lastTime)}</span>
                    </div>

                    <div className="chat-thread-bottom">
                      <span>{thread.lastMsg}</span>
                      {!!thread.unread && (
                        <span className="chat-unread-badge">{thread.unread}</span>
                      )}
                    </div>
                  </button>
                ))}

                {visibleThreads.length === 0 && (
                  <p className="chat-empty-small">Sin conversaciones aún</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="chat-sidebar-header">
                <strong>Pestaña</strong>
                <button type="button" onClick={() => loadChannelMessages(tab)}>
                  ↻
                </button>
              </div>

              <div className="chat-channel-profile">
                <div className="chat-channel-logo">
                  {activeChannel?.logo_url ? (
                    <img src={activeChannel.logo_url} alt={activeChannel.title} />
                  ) : (
                    <span>💬</span>
                  )}

                  {canEditChannelLogo && (
                    <button
                      type="button"
                      className="chat-logo-edit"
                      onClick={() => logoInputRef.current?.click()}
                      title="Cambiar logo de esta pestaña"
                      disabled={uploading}
                    >
                      📷
                    </button>
                  )}
                </div>

                <div>
                  <span className="chat-current-label">Canal activo</span>
                  <strong>{activeChannel?.title}</strong>
                </div>
              </div>

              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleLogoUpload}
              />

              <div className="chat-thread-list" style={{ marginTop: 18 }}>
                {channelPreviewMessages.map((message) => {
                  const senderEmail = message.sender_email || '';
                  const senderName =
                    contactMap[senderEmail.toLowerCase()]?.name || senderEmail || 'Usuario';

                  return (
                    <button
                      key={message.id}
                      type="button"
                      className="chat-thread"
                      onClick={scrollBottom}
                    >
                      <div className="chat-thread-top">
                        <strong>{senderName}</strong>
                        <span>{formatTime(message.created_at)}</span>
                      </div>

                      <div className="chat-thread-bottom">
                        <span>{message.message_text || message.attachment_name || 'Adjunto'}</span>
                      </div>
                    </button>
                  );
                })}

                {channelPreviewMessages.length === 0 && (
                  <p className="chat-empty-small">Sin mensajes en esta pestaña</p>
                )}
              </div>
            </>
          )}
        </aside>

        <section className="chat-main">
          <div className="chat-current-header">
            {tab === 'dm' ? (
              <>
                <span className="chat-current-label">Chat con</span>

                <div className="chat-current-title">
                  <strong>
                    {selectedPeer
                      ? contactMap[selectedPeer.toLowerCase()]?.name || selectedPeer
                      : 'Seleccione un destinatario'}
                  </strong>

                  {selectedPeer && contactMap[selectedPeer.toLowerCase()]?.role && (
                    <span className="chat-role">
                      {contactMap[selectedPeer.toLowerCase()].role}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="chat-current-title">
                <span className="chat-current-label">Mensajes de</span>
                <strong>{activeChannel?.title}</strong>
              </div>
            )}
          </div>

          <div ref={msgRef} className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                {tab === 'dm'
                  ? 'Elegí un destinatario para empezar.'
                  : 'Sin mensajes aún. ¡Escribí el primero!'}
              </div>
            )}

            {messages.map(renderMessage)}

            {typingUsers.length > 0 && (
              <div className="chat-typing">
                {typingUsers.join(', ')} está escribiendo...
              </div>
            )}
          </div>

          <div className="chat-composer">
            <input ref={fileInputRef} type="file" hidden onChange={handleFileInput} />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={(tab === 'dm' && !selectedPeer) || uploading}
              title="Adjuntar archivo"
              className="chat-icon-button"
            >
              {uploading ? '⏳' : '📎'}
            </button>

            <button
              type="button"
              onClick={startRecording}
              disabled={(tab === 'dm' && !selectedPeer) || uploading}
              title={recording ? 'Detener audio' : 'Grabar audio'}
              className={`chat-icon-button ${recording ? 'recording' : ''}`}
            >
              {recording ? '⏹️' : '🎙️'}
            </button>

            <div className="chat-emoji-wrap">
              <button
                type="button"
                onClick={() => setShowEmojis((value) => !value)}
                disabled={tab === 'dm' && !selectedPeer}
                title="Emojis"
                className="chat-icon-button"
              >
                😊
              </button>

              {showEmojis && (
                <div className="chat-emoji-panel">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setText((prev) => `${prev}${emoji}`)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              value={text}
              placeholder="Escribí tu mensaje..."
              onChange={(event) => trackTyping(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  send();
                }
              }}
              disabled={false}
              className="chat-input"
            />

            <button
              type="button"
              onClick={send}
              disabled={uploading || recording || !text.trim()}
              className="chat-send-button"
            >
              Enviar
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
