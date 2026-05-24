export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = localStorage.getItem('token');
  if (token && typeof input === 'string' && input.startsWith('/api')) {
     const customInit = init ? { ...init } : {};
     const customHeaders = new Headers(customInit.headers || {});
     customHeaders.set('Authorization', `Bearer ${token}`);
     customInit.headers = customHeaders;
     return fetch(input, customInit);
  }
  return fetch(input, init);
};

export function playSoftNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    // Tone 1: Gentle root note
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.06, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);
    
    // Tone 2: Uplifting fifth above after a small delay
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.08); // A5
    gain2.gain.setValueAtTime(0.06, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.5);
  } catch (e) {
    console.warn("Nao foi possivel reproduzir o som de notificacao: ", e);
  }
}
