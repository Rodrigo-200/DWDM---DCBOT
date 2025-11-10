declare module 'libsodium-wrappers' {
  const sodium: {
    ready: Promise<void>;
    [key: string]: unknown;
  };
  export default sodium;
}
