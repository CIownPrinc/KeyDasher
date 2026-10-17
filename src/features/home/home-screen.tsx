"use client";

import { Bot, Dices, DoorOpen, Flame, Keyboard, Split, Users, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DasherAvatar } from "@/components/game/dasher-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NAME_MAX_LENGTH, ROOM_CODE_LENGTH, roomCodeSchema } from "@/game/protocol/messages";
import { RACER_COLORS, RACER_SWATCHES } from "@/game/racer/colors";
import { cn } from "@/lib/utils";
import { raceHref } from "../race/route-params";
import type { SessionMode } from "../race/session/types";
import {
  ensureRaceableProfile,
  isRaceableName,
  randomRacerName,
  saveProfile,
  useStoredProfile,
} from "./profile";

const TITLE = "KeyDasher";
/** Literal classes so Tailwind can see them; one per title letter. */
const LETTER_DELAYS = [
  "[animation-delay:0ms]",
  "[animation-delay:90ms]",
  "[animation-delay:180ms]",
  "[animation-delay:270ms]",
  "[animation-delay:360ms]",
  "[animation-delay:450ms]",
  "[animation-delay:540ms]",
  "[animation-delay:630ms]",
  "[animation-delay:720ms]",
];
const LETTER_COLORS = ["text-candy-pink", "text-candy-lemon", "text-candy-mint", "text-candy-sky"];

const STEPS = [
  {
    icon: Keyboard,
    title: "Type to move",
    text: "Finish the text shown to jump, dash, or climb. You can type ahead while you move.",
  },
  {
    icon: Split,
    title: "Pick your path",
    text: "At a fork, type the first letter of a route. Hard words open the fast lanes.",
  },
  {
    icon: Flame,
    title: "Stay clean",
    text: "Clean words build Flow and speed you up. Two slips on a red word and you drop.",
  },
] as const;

interface HomeScreenProps {
  readonly inviteCode: string | null;
}

export function HomeScreen({ inviteCode }: HomeScreenProps) {
  const router = useRouter();
  const profile = useStoredProfile();
  const [joinCode, setJoinCode] = useState(inviteCode ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    ensureRaceableProfile();
  }, []);

  function race(mode: SessionMode) {
    if (!profile || !isRaceableName(profile.name)) {
      setNameError(`Give your racer a name (1–${NAME_MAX_LENGTH} characters).`);
      return;
    }
    router.push(raceHref(mode));
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    const code = roomCodeSchema.safeParse(joinCode);
    if (!code.success) {
      setCodeError(`Room codes are ${ROOM_CODE_LENGTH} letters or numbers.`);
      return;
    }
    race({ kind: "join", code: code.data });
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-gradient-to-b from-[#6b5cff] via-[#c48bff] to-[#ffc2a8] px-4 pt-10 pb-28 sm:pt-16">
      <Backdrop />
      <header className="relative z-10 flex flex-col items-center text-center">
        <h1 className="flex text-6xl font-bold tracking-tight drop-shadow-[0_5px_0_#3a2459] sm:text-8xl">
          {[...TITLE].map((letter, index) => (
            <span
              key={index}
              className={cn(
                "inline-block animate-float",
                LETTER_DELAYS[index],
                LETTER_COLORS[index % LETTER_COLORS.length],
              )}
            >
              {letter}
            </span>
          ))}
        </h1>
        <p className="mt-4 max-w-md text-lg font-medium text-white sm:text-xl">
          The typing platformer race. Type to run, pick risky shortcuts, and beat your friends to the flag.
        </p>
      </header>

      <section
        aria-label="Start racing"
        className="relative z-10 mt-8 w-full max-w-xl rounded-[2rem] border-4 border-ink bg-white p-5 shadow-[0_8px_0_#3a2459] sm:p-7"
      >
        {inviteCode && (
          <div className="mb-5 flex flex-col items-center gap-3 rounded-2xl bg-candy-lemon p-4 text-center sm:flex-row sm:text-left">
            <Users className="size-7 shrink-0 text-ink" aria-hidden="true" />
            <p className="flex-1 font-semibold text-ink">
              You&apos;re invited to room <span className="font-bold tracking-widest">{inviteCode}</span>!
            </p>
            <Button size="lg" onClick={() => race({ kind: "join", code: inviteCode })}>
              Join race
            </Button>
          </div>
        )}

        <RacerPicker
          name={profile?.name ?? ""}
          color={profile?.color ?? "pink"}
          error={nameError}
          disabled={!profile}
          onChange={(next) => {
            setNameError(null);
            saveProfile(next);
          }}
          onSubmit={() => race({ kind: "practice" })}
        />

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button size="xl" className="sm:col-span-2" onClick={() => race({ kind: "practice" })}>
            <Bot data-icon="inline-start" aria-hidden="true" />
            Practice vs bots
          </Button>
          <Button size="xl" variant="candy" onClick={() => race({ kind: "quick" })}>
            <Zap data-icon="inline-start" aria-hidden="true" />
            Quick race online
          </Button>
          <Button size="xl" variant="outline" className="border-ink" onClick={() => race({ kind: "create" })}>
            <DoorOpen data-icon="inline-start" aria-hidden="true" />
            Private room
          </Button>
        </div>

        <form onSubmit={joinRoom} className="mt-5 flex flex-col gap-2" noValidate>
          <label htmlFor="join-code" className="text-sm font-semibold text-muted-foreground">
            Got a room code from a friend?
          </label>
          <div className="flex gap-2">
            <Input
              id="join-code"
              value={joinCode}
              onChange={(event) => {
                setCodeError(null);
                setJoinCode(event.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH));
              }}
              placeholder="ABCD"
              autoComplete="off"
              aria-invalid={codeError !== null}
              aria-describedby={codeError ? "join-code-error" : undefined}
              className="h-11 rounded-full border-2 px-4 text-lg font-bold tracking-[0.3em] uppercase"
            />
            <Button type="submit" size="lg" variant="secondary" className="border-ink/20">
              Join
            </Button>
          </div>
          {codeError && (
            <p id="join-code-error" className="text-sm font-semibold text-destructive">
              {codeError}
            </p>
          )}
        </form>
      </section>

      <section aria-labelledby="how-to-play" className="relative z-10 mt-10 w-full max-w-3xl">
        <h2
          id="how-to-play"
          className="mb-4 text-center text-2xl font-bold text-white drop-shadow-[0_3px_0_#3a2459]"
        >
          How to play
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li
              key={title}
              className="rounded-3xl border-4 border-ink bg-white/95 p-5 shadow-[0_6px_0_#3a2459]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-candy-pink font-bold text-white">
                  {index + 1}
                </span>
                <Icon className="size-6 text-ink" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-lg font-bold text-ink">{title}</h3>
              <p className="mt-1 text-sm font-medium text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

interface RacerPickerProps {
  readonly name: string;
  readonly color: (typeof RACER_COLORS)[number];
  readonly error: string | null;
  readonly disabled: boolean;
  readonly onChange: (profile: { name: string; color: (typeof RACER_COLORS)[number] }) => void;
  readonly onSubmit: () => void;
}

function RacerPicker({ name, color, error, disabled, onChange, onSubmit }: RacerPickerProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <label htmlFor="racer-name" className="text-sm font-semibold text-muted-foreground">
        Your racer
      </label>
      <div className="mt-2 flex items-center gap-3">
        <DasherAvatar color={color} className="size-12" />
        <Input
          id="racer-name"
          value={name}
          disabled={disabled}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => onChange({ name: event.target.value, color })}
          autoComplete="nickname"
          aria-invalid={error !== null}
          aria-describedby={error ? "racer-name-error" : undefined}
          className="h-12 rounded-full border-2 px-4 text-lg font-semibold"
        />
        <Button
          type="button"
          size="icon-lg"
          variant="secondary"
          className="size-12"
          disabled={disabled}
          aria-label="Random name"
          onClick={() => onChange({ name: randomRacerName(), color })}
        >
          <Dices aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p id="racer-name-error" className="mt-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-muted-foreground">Color</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {RACER_COLORS.map((option) => (
            <label key={option} className="cursor-pointer">
              <input
                type="radio"
                name="racer-color"
                value={option}
                checked={option === color}
                disabled={disabled}
                onChange={() => onChange({ name, color: option })}
                className="peer sr-only"
              />
              <span className="sr-only">{RACER_SWATCHES[option].label}</span>
              <span
                aria-hidden="true"
                className="block size-10 rounded-full border-4 border-white ring-2 ring-ink/20 transition peer-checked:scale-110 peer-checked:ring-4 peer-checked:ring-ink peer-focus-visible:ring-4 peer-focus-visible:ring-ring"
                style={{ backgroundColor: RACER_SWATCHES[option].body }}
              />
            </label>
          ))}
        </div>
      </fieldset>
    </form>
  );
}

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute top-[12%] right-[12%] size-32 rounded-full bg-[#fff3c4] shadow-[0_0_120px_60px_rgba(255,236,170,0.45)]" />
      <svg
        className="absolute bottom-0 left-0 h-[45%] w-full"
        viewBox="0 0 1440 400"
        preserveAspectRatio="none"
      >
        <path d="M0 210 Q 180 90 360 190 T 720 170 T 1080 150 T 1440 180 V400 H0Z" fill="#b8a4ff" />
        <path d="M0 290 Q 240 180 480 270 T 960 250 T 1440 260 V400 H0Z" fill="#8fe0c4" />
        <path d="M0 350 Q 300 280 600 340 T 1200 330 T 1440 340 V400 H0Z" fill="#5cc9a7" />
      </svg>
    </div>
  );
}
