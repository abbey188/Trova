"use client";

// Profile — ported from ProfileMobile. Flow map: "Nickname · address · theme · disconnect. A sheet,
// not a settings page." Desktop opens it from the avatar; mobile shows it as the Profile tab.

import { useDisconnect } from "@solana/kit-plugin-wallet/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";

import { solanaClient } from "@/app/providers";
import { Avatar, useOpenHelp } from "@/components/trova/frame";
import { DISPLAY, Icon } from "@/components/trova/kit";
import { ConnectButton, useWalletAddress } from "@/components/trova/wallet";
import { api, shortAddress } from "@/lib/client";

interface Profile { nickname: string | null; alertUntradable: boolean }

function Toggle({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: on ? "flex-end" : "flex-start", width: 44, height: 26, borderRadius: 999, background: on ? "var(--action)" : "var(--hairline)", padding: 3, boxSizing: "border-box", border: "none", cursor: "pointer", flexShrink: 0, opacity: disabled ? 0.6 : 1 }}>
      <span style={{ width: 20, height: 20, borderRadius: 999, background: "#FFFFFF" }} />
    </button>
  );
}

function Row({ icon, children, trailing }: { icon: ReactNode; children: ReactNode; trailing?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", minHeight: 56, boxSizing: "border-box" }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 10, background: "var(--canvas)", color: "var(--ink-soft)", flexShrink: 0 }}>{icon}</span>
      {children}
      <span style={{ flexGrow: 1 }} />
      {trailing}
    </div>
  );
}

const Divider = () => <div style={{ height: 1, background: "var(--track)", margin: "0 16px" }} />;

export function ProfileContent({ onClose }: { onClose?: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const address = useWalletAddress();
  const disconnect = useDisconnect(solanaClient);
  const { resolvedTheme, setTheme } = useTheme();
  const openHelp = useOpenHelp();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Profile>("/api/me", { device: true }), retry: false });
  const save = useMutation({
    mutationFn: (patch: Partial<Profile>) => api<Profile>("/api/me", { method: "PUT", device: true, body: JSON.stringify(patch) }),
    onSuccess: (p) => qc.setQueryData(["me"], p),
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setName(me.data?.nickname ?? ""); }, [me.data?.nickname]);

  const nickname = me.data?.nickname ?? null;
  const dark = resolvedTheme === "dark";

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "var(--canvas)", minHeight: "100%" }}>
      <header style={{ padding: "22px 18px 20px", background: "var(--surface)", display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar size={58} name={nickname} address={address} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); save.mutate({ nickname: name.trim() || null }); setEditing(false); }} style={{ display: "flex", gap: 6 }}>
              <label htmlFor="trova-nickname" className="sr-only">Nickname</label>
              <input id="trova-nickname" autoFocus value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="A first name is plenty"
                style={{ ...DISPLAY, fontSize: 18, fontWeight: 700, border: "1px solid var(--hairline)", borderRadius: 10, padding: "6px 10px", width: 170, background: "var(--canvas)", color: "var(--ink)" }} />
              <button type="submit" style={{ border: "none", borderRadius: 10, padding: "0 12px", background: "var(--action)", color: "var(--action-ink)", fontWeight: 700, cursor: "pointer" }}>Save</button>
            </form>
          ) : (
            <button type="button" onClick={() => setEditing(true)} disabled={me.isError} style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "var(--ink)" }}>
              <span style={{ ...DISPLAY, fontSize: 20, fontWeight: 700 }}>{nickname ?? "Add your name"}</span>
              <span style={{ color: "var(--ink-faint)" }}>{Icon.pencil()}</span>
            </button>
          )}
          {address ? (
            <button type="button" onClick={() => { navigator.clipboard?.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-faint)", border: "none", background: "transparent", padding: 0, cursor: "pointer" }}>
              {shortAddress(address)} {Icon.copy()} {copied && <span style={{ color: "var(--grade-a)", fontWeight: 600 }}>copied</span>}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>No wallet connected</span>
          )}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", alignSelf: "flex-start", display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 12, border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer" }}>{Icon.close()}</button>
        )}
      </header>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
        {!address && <ConnectButton size="lg" />}

        <section style={{ background: "var(--surface)", borderRadius: 16, padding: "4px 0" }}>
          <Row icon={dark ? Icon.sun(17) : Icon.moon(17)} trailing={<Toggle on={dark} label="Dark mode" onClick={() => setTheme(dark ? "light" : "dark")} />}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Dark mode</span>
          </Row>
          <Divider />
          <Row icon={Icon.bell(17)} trailing={<Toggle on={me.data?.alertUntradable ?? true} label="Alerts" disabled={!me.data || save.isPending} onClick={() => save.mutate({ alertUntradable: !(me.data?.alertUntradable ?? true) })} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Alerts</span>
              <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>when a holding stops being tradable · saved on this device</span>
            </div>
          </Row>
        </section>

        <section style={{ background: "var(--surface)", borderRadius: 16, padding: "4px 0" }}>
          <button type="button" onClick={() => { onClose?.(); openHelp(); }} style={{ width: "100%", border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", color: "var(--ink)", fontFamily: "inherit" }}>
            <Row icon={<span style={{ ...DISPLAY, fontSize: 15, fontWeight: 700 }}>?</span>} trailing={Icon.chevronRight(16, "var(--ink-faint)")}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>How ratings work</span>
            </Row>
          </button>
        </section>

        {address && (
          <section style={{ background: "var(--surface)", borderRadius: 16, padding: "4px 0" }}>
            <button type="button" onClick={() => { disconnect.dispatch(); onClose?.(); router.push("/"); }} style={{ width: "100%", border: "none", background: "transparent", padding: "16px", textAlign: "left", cursor: "pointer", color: "var(--danger)", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
              Disconnect wallet
            </button>
          </section>
        )}

        <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-faint)", padding: "4px 4px 0" }}>
          Your name, alerts and watchlist are saved on this device, not tied to your wallet — so setting them never asks for a signature.
        </span>
      </div>
    </div>
  );
}
