"use client";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Camera, Check, File as FileGeneric, FileAudio, FileImage, FileVideo, Laptop, MailWarning, Monitor, Moon, Smartphone, Sun, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AVATAR_MAX_BYTES, AVATAR_SIZE } from "@/lib/avatar";
import {
  applyPreferences,
  defaultPreferences,
  readPreferences,
  savePreferences,
  type Accent,
  type InterfaceSize,
  type Preferences,
  type ThemePreference,
} from "@/lib/preferences";
import { useApp } from "./app-context";

type Result = { error?: { message?: string } | null };

function useAction(refresh = false) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  async function run(task: () => Promise<Result>, success: string) {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const result = await task();
      if (result.error) throw new Error(result.error.message || "Something went wrong.");
      setDone(success);
      if (refresh) router.refresh();
      return true;
    } catch (value) {
      setError(value instanceof Error ? value.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, done, run };
}

function Feedback({ error, done }: { error: string; done: string }) {
  return (
    <>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {done && (
        <p className="settings-note" role="status">
          {done}
        </p>
      )}
    </>
  );
}

// Center-crops to a square and shrinks, so uploads stay small and consistent.
async function squareAvatar(file: File) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  canvas.getContext("2d")!.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 0.88));
  if (!blob || blob.size > AVATAR_MAX_BYTES) throw new Error("That image couldn't be prepared. Try another.");
  return blob;
}

function initialsOf(name: string) {
  return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function PhotoControl({ name, image }: { name: string; image?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const action = useAction(true);
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    action.run(async () => {
      if (!file.type.startsWith("image/"))
        return { error: { message: "Choose a PNG, JPEG or WebP image." } };
      const body = new FormData();
      body.set("file", await squareAvatar(file), "avatar.webp");
      const response = await fetch("/api/avatar", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { error: { message: data.error || "Upload failed. Try again." } };
      return authClient.updateUser({ image: data.image });
    }, "Photo updated.");
  }
  function remove() {
    action.run(async () => {
      await fetch("/api/avatar", { method: "DELETE" });
      return authClient.updateUser({ image: null });
    }, "Photo removed.");
  }
  return (
    <div className="field">
      <span>Profile photo</span>
      <div className="avatar-row">
        <div className="avatar-preview" aria-hidden="true">
          {image ? <img src={image} alt="" /> : initialsOf(name)}
        </div>
        <div className="avatar-actions">
          <button type="button" className="btn" disabled={action.busy} onClick={() => input.current?.click()}>
            <Camera size={15} />
            {action.busy ? "Working…" : image ? "Change photo" : "Upload photo"}
          </button>
          {image && (
            <button type="button" className="btn btn-ghost" disabled={action.busy} onClick={remove}>
              <Trash2 size={15} />
              Remove
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choose} aria-label="Profile photo file" />
      </div>
      <Feedback error={action.error} done={action.done} />
    </div>
  );
}

function EmailStatus({ email, verified }: { email: string; verified: boolean }) {
  const action = useAction();
  return (
    <div className="email-status">
      {verified ? (
        <span className="email-ok"><BadgeCheck size={14} /> Confirmed</span>
      ) : (
        <>
          <span className="email-warn"><MailWarning size={14} /> Not confirmed yet</span>
          <button
            type="button"
            className="text-button"
            disabled={action.busy}
            onClick={() => action.run(() => authClient.sendVerificationEmail({ email, callbackURL: "/settings" }), `Confirmation sent to ${email}.`)}
          >
            {action.busy ? "Sending…" : "Send confirmation email"}
          </button>
        </>
      )}
      <Feedback error={action.error} done={action.done} />
    </div>
  );
}

function ProfileForm({ name, email, image, verified, emailEnabled }: { name: string; email: string; image?: string | null; verified: boolean; emailEnabled: boolean }) {
  const [nextName, setNextName] = useState(name);
  const [nextEmail, setNextEmail] = useState(email);
  const action = useAction(true);
  function submit(event: FormEvent) {
    event.preventDefault();
    action.run(async () => {
      if (nextName.trim() !== name) {
        const result = await authClient.updateUser({ name: nextName.trim() });
        if (result.error) return result;
      }
      if (nextEmail.trim().toLowerCase() !== email.toLowerCase()) {
        return authClient.changeEmail({ newEmail: nextEmail.trim() });
      }
      return {};
    }, "Profile saved.");
  }
  const unchanged = nextName.trim() === name && nextEmail.trim().toLowerCase() === email.toLowerCase();
  return (
    <section className="settings-section" aria-labelledby="profile-heading">
      <h3 id="profile-heading">Profile</h3>
      <p>Your name and the email you sign in with.</p>
      <PhotoControl name={name} image={image} />
      <form className="settings-form" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input required value={nextName} onChange={(e) => setNextName(e.target.value)} autoComplete="name" />
        </label>
        <label className="field">
          <span>Email</span>
          <input required type="email" value={nextEmail} onChange={(e) => setNextEmail(e.target.value)} autoComplete="email" />
        </label>
        {emailEnabled && <EmailStatus email={email} verified={verified} />}
        <Feedback error={action.error} done={action.done} />
        <button className="btn btn-primary" disabled={action.busy || unchanged || !nextName.trim()}>
          {action.busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const action = useAction();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      action.run(async () => ({ error: { message: "The new passwords don't match." } }), "");
      return;
    }
    const ok = await action.run(
      () => authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true }),
      "Password updated. Other devices were signed out.",
    );
    if (ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }
  return (
    <section className="settings-section" aria-labelledby="password-heading">
      <h3 id="password-heading">Password</h3>
      <p>Use at least 8 characters.</p>
      <form className="settings-form" onSubmit={submit}>
        <label className="field">
          <span>Current password</span>
          <input required type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="field">
          <span>New password</span>
          <input required type="password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input required type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        <Feedback error={action.error} done={action.done} />
        <button className="btn btn-primary" disabled={action.busy}>
          {action.busy ? "Updating…" : "Change password"}
        </button>
      </form>
    </section>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const action = useAction();
  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run(() => authClient.deleteUser({ password }), "Account deleted.");
    if (ok) window.location.href = "/login";
  }
  return (
    <section className="settings-section settings-danger" aria-labelledby="delete-heading">
      <h3 id="delete-heading">Delete account</h3>
      <p>Permanently removes your account, boards and uploaded files. This can&apos;t be undone.</p>
      {open ? (
        <form className="settings-form" onSubmit={submit}>
          <label className="field">
            <span>Confirm with your password</span>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <Feedback error={action.error} done={action.done} />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-danger" disabled={action.busy || !password}>
              {action.busy ? "Deleting…" : "Delete my account"}
            </button>
            <button type="button" className="btn" onClick={() => { setOpen(false); setPassword(""); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn-danger" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>
          Delete account…
        </button>
      )}
    </section>
  );
}

type SessionRow = {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

// "Chrome on macOS" from a user-agent string, without a parsing dependency.
function describeDevice(agent?: string | null) {
  if (!agent) return { label: "Unknown device", mobile: false };
  const browser =
    /Edg\//.test(agent) ? "Edge" : /OPR\//.test(agent) ? "Opera" : /Firefox\//.test(agent) ? "Firefox"
    : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const system =
    /iPhone|iPad/.test(agent) ? "iOS" : /Android/.test(agent) ? "Android" : /Mac OS X/.test(agent) ? "macOS"
    : /Windows/.test(agent) ? "Windows" : /Linux/.test(agent) ? "Linux" : "";
  return { label: system ? `${browser} on ${system}` : browser, mobile: /iPhone|Android|Mobile/.test(agent) };
}

function SessionsSection() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [current, setCurrent] = useState("");
  const action = useAction();
  async function load() {
    const [list, active] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    if (list.data) setSessions(list.data as unknown as SessionRow[]);
    setCurrent((active.data?.session as { token?: string } | undefined)?.token ?? "");
  }
  useEffect(() => {
    void load().catch(() => setSessions([]));
  }, []);
  const others = (sessions ?? []).filter((item) => item.token !== current);
  return (
    <section className="settings-section" aria-labelledby="sessions-heading">
      <h3 id="sessions-heading">Devices &amp; sessions</h3>
      <p>Where you&apos;re signed in. Sign out any device you don&apos;t recognize.</p>
      {sessions === null ? (
        <div className="skeleton" style={{ height: 52 }} aria-label="Loading sessions" />
      ) : (
        <ul className="session-list">
          {sessions.map((item) => {
            const device = describeDevice(item.userAgent);
            const isCurrent = item.token === current;
            const Icon = device.mobile ? Smartphone : Monitor;
            return (
              <li key={item.id}>
                <Icon size={18} aria-hidden="true" />
                <div>
                  <strong>
                    {device.label}
                    {isCurrent && <em className="session-current">This device</em>}
                  </strong>
                  <small>
                    {item.ipAddress ? `${item.ipAddress} · ` : ""}
                    Active {new Date(item.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </small>
                </div>
                {!isCurrent && (
                  <button
                    className="btn"
                    disabled={action.busy}
                    onClick={async () => {
                      if (await action.run(() => authClient.revokeSession({ token: item.token }), "Device signed out.")) await load();
                    }}
                  >
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Feedback error={action.error} done={action.done} />
      {others.length > 0 && (
        <button
          className="btn"
          style={{ justifySelf: "start" }}
          disabled={action.busy}
          onClick={async () => {
            if (await action.run(() => authClient.revokeOtherSessions(), "Signed out of other devices.")) await load();
          }}
        >
          Sign out of all other devices
        </button>
      )}
    </section>
  );
}

type StoredFile = { path: string; name: string; size: number; uploaded_at: string; used_on: string[] };

function bytesLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(bytes ? 1 : 0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fileIcon(path: string) {
  if (/\.(png|jpe?g|webp|gif)$/i.test(path)) return FileImage;
  if (/\.(mp4|webm|mov|quicktime)$/i.test(path)) return FileVideo;
  if (/\.(mp3|mpeg|wav|m4a)$/i.test(path)) return FileAudio;
  return FileGeneric;
}

// Uploaded files count against the account's storage. Files still on a board (or in a
// board's trash) can't be deleted here, so removing one never breaks a card.
function StorageSection() {
  const [data, setData] = useState<{ items: StoredFile[]; used: number; quota: number } | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try {
      const response = await fetch("/api/assets?files=1", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Couldn't load your files.");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Couldn't load your files.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function remove(path: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Couldn't delete that file.");
      setData((current) => {
        if (!current) return current;
        const removed = current.items.find((item) => item.path === path);
        return { ...current, items: current.items.filter((item) => item.path !== path), used: current.used - (removed?.size ?? 0) };
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Couldn't delete that file.");
    } finally {
      setConfirm(null);
      setBusy(false);
    }
  }
  const unused = (data?.items ?? []).filter((item) => !item.used_on.length);
  const percent = data ? Math.min(100, Math.round((data.used / data.quota) * 100)) : 0;
  return (
    <section className="settings-section" aria-labelledby="storage-heading">
      <h3 id="storage-heading">Storage</h3>
      <p>Images, videos and files you&apos;ve uploaded to your boards.</p>
      {data === null && !error && <div className="skeleton" style={{ height: 52 }} aria-label="Loading storage" />}
      {data && (
        <div className="storage-meter">
          <div className="storage-meter-text">
            <strong>{bytesLabel(data.used)} of {bytesLabel(data.quota)} used</strong>
            <small>{data.items.length} {data.items.length === 1 ? "file" : "files"}{unused.length ? ` · ${unused.length} not on any board` : ""}</small>
          </div>
          <div className={`storage-bar${percent >= 90 ? " is-full" : ""}`} role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!!data?.items.length && (
        <ul className="session-list" aria-label="Your uploaded files">
          {data.items.map((item) => {
            const Icon = fileIcon(item.path);
            const uses = item.used_on.length;
            return (
              <li key={item.path}>
                <Icon size={18} aria-hidden="true" />
                <div>
                  <strong className="storage-file-name">{item.name || item.path.split("/").pop()}</strong>
                  <small title={item.used_on.join(", ")}>
                    {bytesLabel(item.size)} · {uses ? `On ${uses === 1 ? `“${item.used_on[0]}”` : `${uses} boards`}` : "Not on any board"}
                  </small>
                </div>
                {!uses && (confirm === item.path ? (
                  <span className="storage-confirm">
                    <button className="btn btn-danger" disabled={busy} onClick={() => void remove(item.path)}>Delete</button>
                    <button className="btn" disabled={busy} onClick={() => setConfirm(null)}>Keep</button>
                  </span>
                ) : (
                  <button className="btn btn-ghost" aria-label={`Delete ${item.name || "this file"}`} title="Delete this file" onClick={() => setConfirm(item.path)}>
                    <Trash2 size={15} />
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {data && !data.items.length && <p className="settings-empty">You haven&apos;t uploaded any files yet.</p>}
    </section>
  );
}

const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match system", icon: Laptop },
];
const sizes: { value: InterfaceSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];
const accents: { value: Accent; label: string; color: string }[] = [
  { value: "yellow", label: "Yellow", color: "#f4d35e" },
  { value: "blue", label: "Blue", color: "#7cb7ff" },
  { value: "green", label: "Green", color: "#7fd49a" },
  { value: "neutral", label: "Neutral", color: "#9e9e9e" },
];

// Applies instantly, remembers on this device, and syncs to the account.
function usePreferences(signedIn: boolean) {
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  const [syncError, setSyncError] = useState(false);
  useEffect(() => setPrefs(readPreferences()), []);
  // Follow the operating system while "Match system" is selected.
  useEffect(() => {
    if (prefs.theme !== "system") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const change = () => applyPreferences(prefs);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, [prefs]);
  function update(patch: Partial<Preferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePreferences(next);
    if (!signedIn) return;
    fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((response) => setSyncError(!response.ok))
      .catch(() => setSyncError(true));
  }
  return { prefs, update, syncError };
}

function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: typeof Sun; color?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="choice-group">
      {options.map(({ value: option, label: text, icon: Icon, color }) => (
        <button key={option} role="radio" aria-checked={value === option} className="choice" onClick={() => onChange(option)}>
          {Icon && <Icon size={16} />}
          {color && <span className="choice-swatch" style={{ background: color }} />}
          {text}
          {value === option && <Check size={15} style={{ marginLeft: "auto" }} />}
        </button>
      ))}
    </div>
  );
}

export function Settings() {
  const { user, demo, emailEnabled } = useApp();
  const signedIn = !demo && Boolean(user);
  const { prefs, update, syncError } = usePreferences(signedIn);
  const account = !demo && user;
  const tabs = account
    ? ([["profile", "Profile"], ["appearance", "Appearance"], ["storage", "Storage"], ["security", "Security"]] as const)
    : ([["appearance", "Appearance"]] as const);
  const [tab, setTab] = useState<"profile" | "appearance" | "storage" | "security">(account ? "profile" : "appearance");
  return (
    <div className="settings-page">
      <header>
        <p className="boards-eyebrow">Settings</p>
        <h1 style={{ fontSize: "calc(32px * var(--ui-scale))", letterSpacing: "-1px", margin: "8px 0" }}>
          Your preferences
        </h1>
        {tabs.length > 1 && (
          <div className="settings-tabs" role="tablist" aria-label="Settings sections">
            {tabs.map(([id, label]) => (
              <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </header>
      {account && tab === "profile" && (
        <div role="tabpanel" id="panel-profile" aria-labelledby="tab-profile" className="settings-group">
          <ProfileForm key={`${user.name}|${user.email}|${user.image ?? ""}|${user.emailVerified}`} name={user.name} email={user.email} image={user.image} verified={Boolean(user.emailVerified)} emailEnabled={emailEnabled} />
        </div>
      )}
      {tab === "appearance" && (
        <div role="tabpanel" id="panel-appearance" aria-labelledby="tab-appearance" className="settings-group">
          <section className="settings-section" aria-labelledby="appearance-heading">
            <h3 id="appearance-heading">Look &amp; feel</h3>
            <p>{signedIn ? "Saved to your account, so it follows you to other devices." : "Saved on this device."}</p>
            {syncError && (
              <div className="form-error" role="alert">
                Couldn&apos;t save to your account. It&apos;s kept on this device for now.
              </div>
            )}
            <div className="settings-row">
              <div className="settings-row-text"><strong>Color scheme</strong></div>
              <Choices label="Color scheme" value={prefs.theme} options={themes} onChange={(theme) => update({ theme })} />
            </div>
            <div className="settings-row">
              <div className="settings-row-text">
                <strong>Accent color</strong>
                <small>Buttons, selected items and links.</small>
              </div>
              <Choices label="Accent color" value={prefs.accent} options={accents} onChange={(accent) => update({ accent })} />
            </div>
            <div className="settings-row">
              <div className="settings-row-text">
                <strong>Interface size</strong>
                <small>Menus, spacing, icons and text. Boards keep their size.</small>
              </div>
              <Choices label="Interface size" value={prefs.size} options={sizes} onChange={(size) => update({ size })} />
            </div>
          </section>
        </div>
      )}
      {account && tab === "storage" && (
        <div role="tabpanel" id="panel-storage" aria-labelledby="tab-storage" className="settings-group">
          <StorageSection />
        </div>
      )}
      {account && tab === "security" && (
        <div role="tabpanel" id="panel-security" aria-labelledby="tab-security" className="settings-group">
          <PasswordForm />
          <SessionsSection />
          <DeleteAccount />
        </div>
      )}
    </div>
  );
}
