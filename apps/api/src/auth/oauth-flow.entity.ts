import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type OAuthFlowPurpose = 'login' | 'link' | 'calendar_connect';

/**
 * One browser OAuth round trip. Secrets are kept hashed (SHA-256 hex) except
 * the Google authorization code and the PKCE verifier sent to Google, which
 * are AES-GCM encrypted until the exchange consumes them. Plain entity: rows
 * are short-lived and purged by a cron, never soft-deleted.
 */
@Entity('oauth_flow')
export class OAuthFlow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 24 })
  purpose!: OAuthFlowPurpose;

  /** Set for link / calendar_connect flows (the authenticated initiator). */
  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId!: string | null;

  @Column({ name: 'start_ticket_hash', type: 'varchar', length: 64, nullable: true })
  startTicketHash!: string | null;

  @Column({ name: 'state_hash', type: 'varchar', length: 64, nullable: true })
  stateHash!: string | null;

  @Column({ name: 'nonce_hash', type: 'varchar', length: 64, nullable: true })
  nonceHash!: string | null;

  @Column({ name: 'cookie_secret_hash', type: 'varchar', length: 64, nullable: true })
  cookieSecretHash!: string | null;

  /** base64url(SHA-256(verifier)) of the verifier the web keeps in sessionStorage. */
  @Column({ name: 'code_challenge', type: 'varchar', length: 128 })
  codeChallenge!: string;

  @Column({ name: 'encrypted_pkce_verifier', type: 'text', nullable: true })
  encryptedPkceVerifier!: string | null;

  @Column({ name: 'encrypted_google_code', type: 'text', nullable: true })
  encryptedGoogleCode!: string | null;

  @Column({ name: 'handoff_code_hash', type: 'varchar', length: 64, nullable: true })
  handoffCodeHash!: string | null;

  @Column({ name: 'handoff_expires_at', type: 'timestamptz', nullable: true })
  handoffExpiresAt!: Date | null;

  @Column({ name: 'callback_at', type: 'timestamptz', nullable: true })
  callbackAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
