"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Card } from "@/components/trova/shell";
import { useWalletAddress } from "@/components/trova/wallet";
import { api, shortAddress } from "@/lib/client";

interface Profile { nickname: string | null; alertUntradable: boolean }

export function ProfileView() {
  const qc = useQueryClient();
  const address = useWalletAddress();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Profile>("/api/me", { device: true }), retry: false });
  const [name, setName] = useState("");
  useEffect(() => { if (me.data) setName(me.data.nickname ?? ""); }, [me.data]);

  const save = useMutation({
    mutationFn: (patch: Partial<Profile>) => api<Profile>("/api/me", { method: "PUT", device: true, body: JSON.stringify(patch) }),
    onSuccess: (p) => qc.setQueryData(["me"], p),
  });

  if (me.isError) {
    return <Card className="p-5 text-[13px]"><span style={{ color: "var(--ink-soft)" }}>Settings aren&apos;t available in this browser — its storage is blocked.</span></Card>;
  }

  return (
    <div className="flex max-w-[560px] flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <label htmlFor="trova-nickname" className="text-[13px] font-semibold">What should we call you?</label>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); save.mutate({ nickname: name.trim() || null }); }}
        >
          <input
            id="trova-nickname"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder="A first name is plenty"
            className="h-11 flex-1 rounded-[11px] px-3 text-[14px] outline-none"
            style={{ background: "var(--canvas)" }}
          />
          <button type="submit" disabled={save.isPending} className="h-11 rounded-[11px] px-5 text-[13px] font-bold disabled:opacity-60" style={{ background: "var(--action)", color: "var(--action-ink)" }}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </form>
        {save.isSuccess && <span className="text-[12px]" style={{ color: "var(--grade-a)" }}>Saved.</span>}
      </Card>

      <Card className="flex items-center gap-4 p-5">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold">Alerts</span>
          <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>Flag it on Updates when a holding stops being tradable</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={me.data?.alertUntradable ?? true}
          aria-label="Alert when a holding stops being tradable"
          disabled={!me.data || save.isPending}
          onClick={() => save.mutate({ alertUntradable: !(me.data?.alertUntradable ?? true) })}
          className="relative ml-auto h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60"
          style={{ background: me.data?.alertUntradable ?? true ? "var(--grade-a)" : "var(--hairline)" }}
        >
          <span className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all" style={{ left: me.data?.alertUntradable ?? true ? 24 : 4 }} />
        </button>
      </Card>

      <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
        Your name, alerts and watchlist are saved on this device, not tied to your wallet — so setting them never asks for a signature.
        {address ? ` Connected: ${shortAddress(address)}, read by address only.` : ""}
      </p>
    </div>
  );
}
