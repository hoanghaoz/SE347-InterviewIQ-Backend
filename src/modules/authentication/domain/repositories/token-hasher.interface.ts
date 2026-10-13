export abstract class ITokenHasher {
  abstract generateToken(): string;
  abstract hashToken(token: string): string;
}
