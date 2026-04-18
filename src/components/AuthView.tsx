import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { lovable } from '@/integrations/lovable/index';
import { toast } from 'sonner';
import AnimatedStars from './AnimatedStars';

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
    <div className="relative min-h-screen">
      {/* Fondo animado de estrellas */}
      <AnimatedStars />
      
      {/* Contenido del login */}
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className="w-full max-w-[380px]">
          {/* Logo y título */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <img
                src="https://cdn.shopify.com/s/files/1/0885/3012/5095/files/Captura_de_pantalla_2026-01-12_023843.jpg?v=1768196352"
                alt="DCANP GROUP Logo"
                className="w-14 h-14 rounded-xl object-cover"
              />
            </div>
            <h1 className="text-xl font-bold text-white">DCANP Group</h1>
          </div>

          {/* CUADRO DE LOGIN EN NEGRO */}
          <div className="bg-black/90 backdrop-blur-sm rounded-2xl p-6 border border-white/10 shadow-2xl">
            {mode === 'login' ? (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="text-white/60 text-sm block mb-1.5">Correo electrónico</label>
                    <input
                      type="email"
                      className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 transition-colors"
                      placeholder="deividaguilar06@gmail.com"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-1.5">Contraseña</label>
                    <input
                      type="password"
                      className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 transition-colors"
                      placeholder="**************"
                      value={loginPass}
                      onChange={e => setLoginPass(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    />
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full mt-5 bg-white text-black font-semibold rounded-xl py-2.5 hover:bg-white/90 transition-all disabled:opacity-50"
                >
                  {loading ? 'Ingresando...' : 'Iniciar sesión'}
                </button>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-black text-white/40">O continuar con</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/20 rounded-xl py-2.5 hover:bg-white/10 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-white">Google</span>
                </button>

                <p className="text-center text-white/40 text-sm mt-5">
                  ¿No tienes cuenta?{' '}
                  <button onClick={() => setMode('register')} className="text-white hover:underline">
                    Registrate
                  </button>
                </p>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-white/60 text-sm block mb-1.5">Nombre</label>
                    <input
                      type="text"
                      className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 transition-colors"
                      placeholder="Tu nombre"
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-1.5">Correo electrónico</label>
                    <input
                      type="email"
                      className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 transition-colors"
                      placeholder="tu@email.com"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-1.5">Contraseña</label>
                    <input
                      type="password"
                      className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-white/50 transition-colors"
                      placeholder="••••••••"
                      value={regPass}
                      onChange={e => setRegPass(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-1.5">Rol</label>
                    <select
                      className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-white/50 transition-colors"
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
                  onClick={handleRegister}
                  disabled={loading}
                  className="w-full mt-5 bg-white text-black font-semibold rounded-xl py-2.5 hover:bg-white/90 transition-all disabled:opacity-50"
                >
                  {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                </button>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-black text-white/40">O continuar con</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/20 rounded-xl py-2.5 hover:bg-white/10 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-white">Google</span>
                </button>

                <p className="text-center text-white/40 text-sm mt-5">
                  ¿Ya tienes cuenta?{' '}
                  <button onClick={() => setMode('login')} className="text-white hover:underline">
                    Iniciar sesión
                  </button>
                </p>
              </>
            )}
          </div>

          <p className="text-center text-white/30 text-[11px] mt-5">
            Plataforma de gestión de DCANP Group
          </p>
        </div>
      </div>
    </div>
  );
}
