export interface ServerConfig {
  port: number;
  auth?: {
    username: string;
    password: string;
  };
}

export function serverConfig(): ServerConfig {
  const authPassword = process.env.AUTH_PASSWORD?.trim();
  const config: ServerConfig = {
    port: Number(process.env.PORT ?? 3000),
  };
  if (authPassword) {
    config.auth = {
      username: process.env.AUTH_USERNAME?.trim() || "admin",
      password: authPassword,
    };
  }
  return config;
}
