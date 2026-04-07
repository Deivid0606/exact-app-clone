import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface AuthViewProps {
  onSuccess: () => void;
}

export default function AuthView({ onSuccess }: AuthViewProps) {
  const { signIn, signUp } = useAuth();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regRole, setRegRole] = useState('VENDEDOR');
  const [rememberEmail, setRememberEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!loginEmail || !loginPass) { toast.error('Completá email y contraseña'); return; }
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPass);
    setLoading(false);
    if (error) { toast.error(error); return; }
    toast.success('¡Bienvenido!');
    onSuccess();
  };

  const handleRegister = async () => {
    if (!regName || !regEmail || !regPass) { toast.error('Completá todos los campos'); return; }
    setLoading(true);
    const { error } = await signUp(regEmail, regPass, regName, regRole);
    setLoading(false);
    if (error) { toast.error(error); return; }
    toast.success('Cuenta creada. Revisá tu email para confirmar.');
  };

  return (
    <div className="app-card">
      <div className="flex flex-wrap gap-4">
        {/* Login */}
        <div className="flex-1 min-w-[320px]">
          <h3 className="text-lg font-extrabold mb-2">Ingresar</h3>
          <label className="app-label">Email</label>
          <input className="app-input" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
          <label className="app-label">Contraseña</label>
          <input className="app-input" type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          <div className="flex items-center gap-4 mt-1.5">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" className="accent-brand" /> Mantener sesión (30 días)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={rememberEmail} onChange={e => setRememberEmail(e.target.checked)} className="accent-brand" /> Recordar email
            </label>
          </div>
          <div className="flex gap-2 mt-2.5">
            <button className="nav-btn active" onClick={handleLogin} disabled={loading}>
              {loading ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Entrando...</span> : 'Entrar'}
            </button>
          </div>
          <div className="mt-2">
            <button className="nav-btn text-xs">¿No recuerdo mi contraseña?</button>
          </div>
        </div>

        {/* Register */}
        <div className="flex-1 min-w-[320px]">
          <h3 className="text-lg font-extrabold mb-2">Crear cuenta</h3>
          <label className="app-label">Nombre</label>
          <input className="app-input" value={regName} onChange={e => setRegName(e.target.value)} />
          <label className="app-label">Email</label>
          <input className="app-input" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
          <label className="app-label">Contraseña</label>
          <input className="app-input" type="password" value={regPass} onChange={e => setRegPass(e.target.value)} />
          <label className="app-label">Rol</label>
          <select className="app-input" value={regRole} onChange={e => setRegRole(e.target.value)}>
            <option value="VENDEDOR">VENDEDOR</option>
            <option value="DELIVERY">DELIVERY</option>
            <option value="DESPACHANTE">DESPACHANTE</option>
            <option value="PROVEEDOR">PROVEEDOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <small className="text-xs text-muted-foreground mt-1 block">
            ⚡ El primer usuario creado será ADMIN automáticamente.
          </small>
          <div className="mt-2.5">
            <button className="nav-btn active" onClick={handleRegister} disabled={loading}>
              {loading ? <span className="flex items-center gap-2"><span className="btn-spinner" /> Registrando...</span> : 'Registrarme'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
