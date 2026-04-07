import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { lovable } from '@/integrations/lovable/index';
import { toast } from 'sonner';

interface AuthViewProps {
  onSuccess: () => void;
}

export default function AuthView({ onSuccess }: AuthViewProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regRole, setRegRole] = useState('VENDEDOR');
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

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error('Error al iniciar con Google');
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      toast.success('¡Bienvenido!');
      onSuccess();
    } catch {
      toast.error('Error al iniciar con Google');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-[420px]">
        {/* Logo & Welcome */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="https://cdn.shopify.com/s/files/1/0885/3012/5095/files/Captura_de_pantalla_2026-01-12_023843.jpg?v=1768196352"
            alt="DCANP GROUP Logo"
            className="w-16 h-16 rounded-2xl object-cover mb-4"
          />
          <h1 className="text-2xl font-extrabold text-white">DCANP Group</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === 'login' ? 'Iniciar sesión en tu cuenta' : 'Crear una cuenta nueva'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6">
          {mode === 'login' ? (
            <>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1.5">Email</label>
                  <input
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="tu@email.com"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1.5">Contraseña</label>
                  <input
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    type="password"
                    placeholder="••••••••"
                    value={loginPass}
                    onChange={e => setLoginPass(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  />
                </div>
              </div>

              <button
                className="w-full mt-6 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg py-3 transition-colors disabled:opacity-50"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="btn-spinner" /> Entrando...
                  </span>
                ) : 'Iniciar Sesión'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">o continuar con</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Google */}
              <button
                className="w-full flex items-center justify-center gap-3 bg-secondary hover:bg-secondary/80 border border-border text-foreground font-medium rounded-lg py-2.5 transition-colors disabled:opacity-50"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>

              <p className="text-center text-sm text-muted-foreground mt-5">
                ¿No tenés cuenta?{' '}
                <button className="text-primary font-semibold hover:underline" onClick={() => setMode('register')}>
                  Registrate
                </button>
              </p>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1.5">Nombre</label>
                  <input
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Tu nombre"
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1.5">Email</label>
                  <input
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="tu@email.com"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1.5">Contraseña</label>
                  <input
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    type="password"
                    placeholder="••••••••"
                    value={regPass}
                    onChange={e => setRegPass(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1.5">Rol</label>
                  <select
                    className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    value={regRole}
                    onChange={e => setRegRole(e.target.value)}
                  >
                    <option value="VENDEDOR">VENDEDOR</option>
                    <option value="DELIVERY">DELIVERY</option>
                    <option value="DESPACHANTE">DESPACHANTE</option>
                    <option value="PROVEEDOR">PROVEEDOR</option>
                  </select>
                </div>
              </div>


              <button
                className="w-full mt-5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg py-3 transition-colors disabled:opacity-50"
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="btn-spinner" /> Registrando...
                  </span>
                ) : 'Crear Cuenta'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">o continuar con</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Google */}
              <button
                className="w-full flex items-center justify-center gap-3 bg-secondary hover:bg-secondary/80 border border-border text-foreground font-medium rounded-lg py-2.5 transition-colors disabled:opacity-50"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>

              <p className="text-center text-sm text-muted-foreground mt-5">
                ¿Ya tenés cuenta?{' '}
                <button className="text-primary font-semibold hover:underline" onClick={() => setMode('login')}>
                  Iniciar Sesión
                </button>
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Bienvenido a la plataforma de gestión de DCANP Group
        </p>
      </div>
    </div>
  );
}
