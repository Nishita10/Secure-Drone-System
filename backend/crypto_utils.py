import os
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, NoEncryption
from cryptography.exceptions import InvalidSignature


class CryptoManager:
    """
    Complete cryptographic manager for the Secure Drone Pipeline.

    Provides:
      1. AES-256-GCM symmetric encryption for telemetry data
      2. RSA-2048 + PSS command signing (proof-of-identity / anti-hijacking)
      3. X25519 ECDH ephemeral key exchange (Perfect Forward Secrecy)
    """

    def __init__(self, key_file="shared_secret.key"):
        # ── AES-256-GCM ───────────────────────────────────────────────────
        if os.path.exists(key_file):
            with open(key_file, "rb") as f:
                self.aes_key = f.read()
        else:
            self.aes_key = AESGCM.generate_key(bit_length=256)
            with open(key_file, "wb") as f:
                f.write(self.aes_key)

        self.aesgcm = AESGCM(self.aes_key)

        # ── RSA-2048 (command signing) ─────────────────────────────────────
        self.private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        self.public_key = self.private_key.public_key()

        # ── X25519 ECDH (ephemeral session keys) ─────────────────────────
        self.ecdh_private = None
        self.ecdh_public = None
        self.ecdh_public_bytes = None

    # ─── AES-GCM Telemetry Encryption ────────────────────────────────────

    def encrypt_telemetry(self, data: bytes) -> bytes:
        """Encrypt telemetry using AES-256-GCM. Returns nonce‖ciphertext."""
        nonce = os.urandom(12)
        ciphertext = self.aesgcm.encrypt(nonce, data, None)
        return nonce + ciphertext

    def decrypt_telemetry(self, encrypted_data: bytes) -> bytes:
        """Decrypt nonce‖ciphertext → plaintext. Raises on auth failure."""
        nonce = encrypted_data[:12]
        ciphertext = encrypted_data[12:]
        return self.aesgcm.decrypt(nonce, ciphertext, None)

    # ─── RSA Command Signing ──────────────────────────────────────────────

    def sign_command(self, command: bytes) -> bytes:
        """Sign a GCS command payload with the RSA private key (PSS + SHA-256)."""
        return self.private_key.sign(
            command,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            hashes.SHA256(),
        )

    def verify_command(self, command: bytes, signature: bytes) -> bool:
        """Verify the command signature using the RSA public key."""
        try:
            self.public_key.verify(
                signature,
                command,
                padding.PSS(
                    mgf=padding.MGF1(hashes.SHA256()),
                    salt_length=padding.PSS.MAX_LENGTH,
                ),
                hashes.SHA256(),
            )
            return True
        except InvalidSignature:
            return False

    # ─── X25519 ECDH Key Exchange (PFS) ──────────────────────────────────

    def generate_ecdh_keypair(self):
        """
        Generate a fresh X25519 ephemeral key pair.
        Call this at the start of every session (before exchanging keys).
        Returns the raw 32-byte public key to send to the peer.
        """
        self.ecdh_private = X25519PrivateKey.generate()
        self.ecdh_public = self.ecdh_private.public_key()
        self.ecdh_public_bytes = self.ecdh_public.public_bytes(Encoding.Raw, PublicFormat.Raw)
        return self.ecdh_public_bytes

    def derive_session_key(self, peer_public_key_bytes: bytes) -> bytes:
        """
        Perform ECDH with the peer's X25519 public key.
        Derives a 256-bit session key via HKDF-SHA256 and switches the
        AES-GCM cipher to use it — enabling Perfect Forward Secrecy.

        Returns the derived session key bytes.
        """
        if self.ecdh_private is None:
            raise RuntimeError("Call generate_ecdh_keypair() before derive_session_key()")

        peer_key = X25519PrivateKey.from_private_bytes(peer_public_key_bytes)  # type: ignore
        # Use the correct from_public_bytes API
        from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PublicKey
        peer_pub = X25519PublicKey.from_public_bytes(peer_public_key_bytes)
        shared_secret = self.ecdh_private.exchange(peer_pub)

        # HKDF with domain-separation info string
        session_key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"SecureDronePipeline-v2-session",
        ).derive(shared_secret)

        # Hot-swap the AES key to the derived session key
        self.aes_key = session_key
        self.aesgcm = AESGCM(session_key)
        return session_key

    def get_ecdh_public_bytes(self) -> bytes:
        """Return the current ECDH ephemeral public key bytes (32 bytes)."""
        if self.ecdh_public_bytes is None:
            return self.generate_ecdh_keypair()
        return self.ecdh_public_bytes


# ─── Quick test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cm = CryptoManager()
    print("CryptoManager v2 — AES-GCM + RSA + ECDH\n")

    # Test AES-GCM
    payload = b'{"lat":37.77,"lon":-122.41,"alt":100}'
    enc = cm.encrypt_telemetry(payload)
    dec = cm.decrypt_telemetry(enc)
    print(f"AES-GCM OK: {dec.decode()}")

    # Test RSA signing
    cmd = b"GOTO_WAYPOINT_5"
    sig = cm.sign_command(cmd)
    print(f"RSA Sign OK: {cm.verify_command(cmd, sig)} | Attack cmd: {cm.verify_command(b'EVIL', sig)}")

    # Test ECDH key exchange
    cm2 = CryptoManager()
    pub1 = cm.generate_ecdh_keypair()
    pub2 = cm2.generate_ecdh_keypair()
    key1 = cm.derive_session_key(pub2)
    key2 = cm2.derive_session_key(pub1)
    print(f"ECDH PFS OK: Session keys match = {key1 == key2}")
