-- Migration: Sistema de OTP para reset de PIN de residentes
-- Data: 2025-12-01
-- Descrição: Permite que residentes resetem seu próprio PIN via SMS

-- 1. Criar tabela de códigos OTP
CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL, -- 'RESET_PIN', 'VERIFY_PHONE', etc.
  resident_id INTEGER REFERENCES residents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes'),
  used_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  ip_address TEXT,
  user_agent TEXT
);

-- 2. Índices para performance
CREATE INDEX idx_otp_codes_phone ON otp_codes(phone);
CREATE INDEX idx_otp_codes_expires_at ON otp_codes(expires_at);
CREATE INDEX idx_otp_codes_resident_id ON otp_codes(resident_id);

-- 3. Policy de limpeza automática de OTPs expirados (executar diariamente)
-- Você pode usar pg_cron ou um cronjob externo
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM otp_codes
  WHERE expires_at < NOW() - INTERVAL '1 day';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 4. Trigger para limitar rate de OTPs por telefone
-- (máximo 5 OTPs por telefone a cada 1 hora)
CREATE OR REPLACE FUNCTION check_otp_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM otp_codes
  WHERE phone = NEW.phone
    AND created_at > NOW() - INTERVAL '1 hour';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde 1 hora antes de solicitar novo código.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_otp_rate_limit
  BEFORE INSERT ON otp_codes
  FOR EACH ROW
  EXECUTE FUNCTION check_otp_rate_limit();

-- 5. Comentários
COMMENT ON TABLE otp_codes IS 'Armazena códigos OTP temporários para verificação de telefone e reset de PIN';
COMMENT ON COLUMN otp_codes.purpose IS 'Tipo de operação: RESET_PIN, VERIFY_PHONE, etc.';
COMMENT ON COLUMN otp_codes.attempts IS 'Número de tentativas de validação do código';
COMMENT ON COLUMN otp_codes.max_attempts IS 'Máximo de tentativas permitidas antes de invalidar o código';
