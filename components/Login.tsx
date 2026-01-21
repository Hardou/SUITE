import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, User, ArrowRight, Database, AlertCircle, Loader2, Key, Github, Globe, CheckCircle } from 'lucide-react';

type ViewState = 'login' | 'register' | 'forgot' | 'reset';

interface InputFieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: React.ElementType;
  placeholder: string;
  required?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({ label, type, value, onChange, icon: Icon, placeholder, required = true }) => (
  <div className="space-y-2">
    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
      <input
        type={type}
        required={required}
        value={value}
        onChange={onChange}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 font-sans"
        placeholder={placeholder}
      />
    </div>
  </div>
);

export const Login: React.FC = () => {
  const [view, setView] = useState<ViewState>('login');
  
  // Consolidated Form State
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    resetToken: ''
  });
  
  const [status, setStatus] = useState<{ type: 'error' | 'success' | null, message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);
  
  const { login, register, requestPasswordReset, confirmPasswordReset } = useAuth();

  useEffect(() => {
    // Check for verification success param
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === 'true') {
      setStatus({ type: 'success', message: 'Email verified successfully! You can now sign in.' });
      // Clean URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('verified');
      window.history.replaceState({}, document.title, newUrl.toString());
    }
  }, []);

  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const clearStatus = () => setStatus({ type: null, message: '' });

  const switchView = (newView: ViewState) => {
    clearStatus();
    setView(newView);
    // Keep email populated for convenience, clear sensitive fields
    setFormData(prev => ({ ...prev, password: '', resetToken: '' })); 
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearStatus();
    setLoading(true);

    const { email, password, fullName, resetToken } = formData;

    try {
      switch (view) {
        case 'login':
          await login(email, password);
          break;
          
        case 'register':
          if (!fullName.trim()) throw new Error("Full name is required");
          await register(email, password, fullName);
          setStatus({ 
            type: 'success', 
            message: 'Registration successful! Please check your email (and console) for the verification link.' 
          });
          // Transition to login view after success message
          setTimeout(() => switchView('login'), 4000);
          break;
          
        case 'forgot':
          await requestPasswordReset(email);
          setStatus({ type: 'success', message: 'If the email exists, a reset token has been sent (check console).' });
          // Auto transition to reset view after short delay for better UX
          setTimeout(() => switchView('reset'), 2500);
          break;
          
        case 'reset':
          await confirmPasswordReset(resetToken, password);
          setStatus({ type: 'success', message: 'Password reset successfully! Redirecting to login...' });
          setTimeout(() => switchView('login'), 2000);
          break;
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Operation failed. Check backend connection.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider: 'google' | 'github') => {
    // Redirect to backend endpoint
    window.location.href = `http://localhost:8000/login/${provider}`;
  };

  // Dynamic Header Content based on ViewState
  const headerContent = {
    login: { title: "Welcome Back", subtitle: "Secure DevOps & SEO Intelligence Access" },
    register: { title: "Create Account", subtitle: "Join BlankDigi Suite" },
    forgot: { title: "Recovery", subtitle: "Enter email to receive reset token" },
    reset: { title: "Set Password", subtitle: "Enter token and new password" }
  }[view];

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden relative z-10 transition-all duration-300">
        
        {/* Header */}
        <div className="p-8 pb-0 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4 shadow-lg shadow-cyan-500/20">
            <Database className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{headerContent.title}</h1>
          <p className="text-slate-400 text-sm">{headerContent.subtitle}</p>
        </div>

        <div className="p-8 pt-6 space-y-4">
          
          {/* Status Messages */}
          {status.message && (
            <div className={`p-3 rounded-lg flex items-start gap-3 border ${
              status.type === 'error' 
                ? 'bg-red-500/10 border-red-500/20 text-red-200' 
                : 'bg-green-500/10 border-green-500/20 text-green-200'
            }`}>
              {status.type === 'error' ? <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" /> : <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />}
              <p className="text-sm">{status.message}</p>
            </div>
          )}
          
          {/* Social Login Buttons */}
          {view === 'login' && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button 
                type="button"
                onClick={() => handleSocialLogin('google')}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium text-white transition-all"
              >
                <Globe className="w-4 h-4 text-cyan-400" />
                Google
              </button>
              <button 
                type="button"
                onClick={() => handleSocialLogin('github')}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium text-white transition-all"
              >
                <Github className="w-4 h-4 text-white" />
                GitHub
              </button>
            </div>
          )}
          
          {view === 'login' && (
             <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink-0 mx-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Or continue with email</span>
                <div className="flex-grow border-t border-slate-800"></div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Conditional Fields */}
            {view === 'register' && (
              <InputField 
                label="Full Name" 
                type="text" 
                value={formData.fullName} 
                onChange={handleInputChange('fullName')} 
                icon={User} 
                placeholder="John Doe" 
              />
            )}

            {['login', 'register', 'forgot'].includes(view) && (
              <InputField 
                label="Email Address" 
                type="email" 
                value={formData.email} 
                onChange={handleInputChange('email')} 
                icon={Mail} 
                placeholder="admin@blankdigi.com" 
              />
            )}

            {view === 'reset' && (
               <InputField 
                label="Reset Token" 
                type="text" 
                value={formData.resetToken} 
                onChange={handleInputChange('resetToken')} 
                icon={Key} 
                placeholder="Paste token here" 
              />
            )}

            {['login', 'register', 'reset'].includes(view) && (
              <InputField 
                label={view === 'reset' ? "New Password" : "Password"}
                type="password" 
                value={formData.password} 
                onChange={handleInputChange('password')} 
                icon={Lock} 
                placeholder="••••••••" 
              />
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-cyan-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  {view === 'login' && 'Sign In'}
                  {view === 'register' && 'Create Account'}
                  {view === 'forgot' && 'Send Reset Link'}
                  {view === 'reset' && 'Reset Password'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer Navigation */}
        <div className="bg-slate-950/50 border-t border-slate-800 p-4 text-center">
          {view === 'login' && (
            <div className="space-x-4 text-sm">
              <button onClick={() => switchView('register')} className="text-slate-400 hover:text-cyan-400 transition-colors">Register</button>
              <span className="text-slate-700">|</span>
              <button onClick={() => switchView('forgot')} className="text-slate-400 hover:text-cyan-400 transition-colors">Forgot Password?</button>
            </div>
          )}
          
          {view === 'register' && (
             <button onClick={() => switchView('login')} className="text-sm text-slate-400 hover:text-cyan-400 transition-colors">
               Already have an account? Sign In
             </button>
          )}

          {['forgot', 'reset'].includes(view) && (
            <div className="space-x-4 text-sm">
              <button onClick={() => switchView('login')} className="text-slate-400 hover:text-cyan-400 transition-colors">Back to Login</button>
              {view === 'forgot' && (
                <>
                  <span className="text-slate-700">|</span>
                  <button onClick={() => switchView('reset')} className="text-slate-400 hover:text-cyan-400 transition-colors">I have a token</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};