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
