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
      <AnimatedStars />
      
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className="w-full max-w-[400px]">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <img
                  src="https://cdn.shopify.com/s/files/1/0885/3012/5095/files/Captura_de_pantalla_2026-01-12_023843.jpg?v=1768196352"
                  alt="DCANP GROUP Logo"
                  className="w-12 h-12 rounded-xl object-cover"
                />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">DCANP Group</h1>
            <p className="text-white/50 text-sm">
              {mode === 'login' ? 'Accede a tu cuenta' : 'Crea tu cuenta'}
            </p>
          </div>

          {/* Hero Text */}
          <div className="text-center mb-8">
            <p className="text-white/40 text-xs uppercase tracking-[0.2em] mb-2">🇵🇾 Paraguay</p>
            <h2 className="text-3xl font-bold text-white mb-3 leading-tight">
              Tu negocio online<br />
              <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                empieza aquí
              </span>
            </h2>
            <div className="w-12 h-px bg-white/20 mx-auto my-4"></div>
            <p className="text-white/40 text-sm leading-relaxed">
              La red de dropshipping más grande de Paraguay. Sin stock, sin riesgos.
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            {mode === 'login' ? (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="text-white/60 text-sm block mb-2">Correo electrónico</label>
                    <input
                      type="email"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                      placeholder="tu@email.com"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-2">Contraseña</label>
                    <input
                      type="password"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                      placeholder="••••••••"
                      value={loginPass}
                      onChange={e => setLoginPass(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    />
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full mt-6 bg-white text-black font-semibold rounded-xl py-3 hover:bg-white/90 transition-all disabled:opacity-50"
                >
                  {loading ? 'Ingresando...' : 'Iniciar sesión'}
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-transparent text-white/40">O continuar con</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 rounded-xl py-3 hover:bg-white/10 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-white">Google</span>
                </button>

                <p className="text-center text-white/40 text-sm mt-6">
                  ¿No tienes cuenta?{' '}
                  <button onClick={() => setMode('register')} className="text-white hover:underline">
                    Regístrate
                  </button>
                </p>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="text-white/60 text-sm block mb-2">Nombre completo</label>
                    <input
                      type="text"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                      placeholder="Tu nombre"
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-2">Correo electrónico</label>
                    <input
                      type="email"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                      placeholder="tu@email.com"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-2">Contraseña</label>
                    <input
                      type="password"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                      placeholder="••••••••"
                      value={regPass}
                      onChange={e => setRegPass(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-sm block mb-2">Rol</label>
                    <select
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
                      value={regRole}
                      onChange={e => setRegRole(e.target.value)}
                    >
                      <option value="VENDEDOR" className="bg-black">VENDEDOR</option>
                      <option value="DELIVERY" className="bg-black">DELIVERY</option>
                      <option value="DESPACHANTE" className="bg-black">DESPACHANTE</option>
                      <option value="PROVEEDOR" className="bg-black">PROVEEDOR</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="w-full mt-6 bg-white text-black font-semibold rounded-xl py-3 hover:bg-white/90 transition-all disabled:opacity-50"
                >
                  {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-transparent text-white/40">O continuar con</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 rounded-xl py-3 hover:bg-white/10 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-white">Google</span>
                </button>

                <p className="text-center text-white/40 text-sm mt-6">
                  ¿Ya tienes cuenta?{' '}
                  <button onClick={() => setMode('login')} className="text-white hover:underline">
                    Iniciar sesión
                  </button>
                </p>
              </>
            )}
          </div>

          <p className="text-center text-white/30 text-xs mt-6">
            Plataforma de gestión DCANP Group
          </p>
        </div>
      </div>
    </div>
  );
}
