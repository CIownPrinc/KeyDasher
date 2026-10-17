import type { Vec } from "@/game/math";
import { BISCUIT, LAKE, SPRINKLES } from "./palette";

type ParticleKind = "dust" | "spark" | "confetti" | "drop" | "crumb" | "text";

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ageSeconds: number;
  lifeSeconds: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  text: string;
}

const GRAVITY: Readonly<Record<ParticleKind, number>> = {
  dust: -40,
  spark: 300,
  confetti: 260,
  drop: 1400,
  crumb: 1600,
  text: 0,
};
const MAX_PARTICLES = 600;

function spread(range: number): number {
  return (Math.random() - 0.5) * range;
}

/** Every bit of juice: dust puffs, sparkles, confetti, splashes, crumbs, and floating words. */
export class ParticleSystem {
  private particles: Particle[] = [];

  private add(particle: Partial<Particle> & Pick<Particle, "kind" | "x" | "y">): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      vx: 0,
      vy: 0,
      ageSeconds: 0,
      lifeSeconds: 0.6,
      size: 6,
      color: "#ffffff",
      rotation: 0,
      spin: 0,
      text: "",
      ...particle,
    });
  }

  dust(at: Vec, count: number, power = 1): void {
    for (let index = 0; index < count; index += 1) {
      const direction = index % 2 === 0 ? 1 : -1;
      this.add({
        kind: "dust",
        x: at.x + spread(16),
        y: at.y - 4,
        vx: direction * (40 + Math.random() * 110) * power,
        vy: -20 - Math.random() * 50,
        lifeSeconds: 0.35 + Math.random() * 0.3,
        size: 6 + Math.random() * 8 * power,
        color: "rgba(255, 250, 240, 0.9)",
      });
    }
  }

  sparkle(at: Vec, count: number, colors: readonly string[] = SPRINKLES): void {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 120 + Math.random() * 160;
      this.add({
        kind: "spark",
        x: at.x,
        y: at.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        lifeSeconds: 0.45 + Math.random() * 0.3,
        size: 4 + Math.random() * 4,
        color: colors[index % colors.length] ?? "#ffffff",
        spin: spread(12),
      });
    }
  }

  confetti(at: Vec, count: number): void {
    for (let index = 0; index < count; index += 1) {
      this.add({
        kind: "confetti",
        x: at.x + spread(40),
        y: at.y,
        vx: spread(520),
        vy: -260 - Math.random() * 380,
        lifeSeconds: 1.4 + Math.random() * 0.8,
        size: 6 + Math.random() * 6,
        color: SPRINKLES[index % SPRINKLES.length] ?? "#ffffff",
        rotation: Math.random() * Math.PI,
        spin: spread(18),
      });
    }
  }

  splash(at: Vec): void {
    for (let index = 0; index < 22; index += 1) {
      this.add({
        kind: "drop",
        x: at.x + spread(30),
        y: at.y,
        vx: spread(380),
        vy: -320 - Math.random() * 420,
        lifeSeconds: 0.9,
        size: 5 + Math.random() * 7,
        color: index % 3 === 0 ? LAKE.shine : LAKE.surface,
      });
    }
  }

  crumble(at: Vec): void {
    for (let index = 0; index < 16; index += 1) {
      this.add({
        kind: "crumb",
        x: at.x + spread(80),
        y: at.y + Math.random() * 20,
        vx: spread(160),
        vy: -60 - Math.random() * 120,
        lifeSeconds: 1.1,
        size: 6 + Math.random() * 10,
        color: index % 2 === 0 ? BISCUIT.body : BISCUIT.edge,
        rotation: Math.random() * Math.PI,
        spin: spread(10),
      });
    }
  }

  popup(at: Vec, text: string, color: string): void {
    this.add({ kind: "text", x: at.x, y: at.y, vy: -70, lifeSeconds: 1.1, size: 22, color, text });
  }

  update(deltaSeconds: number): void {
    for (const particle of this.particles) {
      particle.ageSeconds += deltaSeconds;
      particle.vy += GRAVITY[particle.kind] * deltaSeconds;
      if (particle.kind === "confetti") particle.vx *= 1 - 1.5 * deltaSeconds;
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.rotation += particle.spin * deltaSeconds;
    }
    this.particles = this.particles.filter((particle) => particle.ageSeconds < particle.lifeSeconds);
  }

  draw(context: CanvasRenderingContext2D, fontFamily: string): void {
    for (const particle of this.particles) {
      const life = particle.ageSeconds / particle.lifeSeconds;
      context.save();
      context.globalAlpha = Math.max(0, 1 - life * life);
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      drawParticle(context, particle, life, fontFamily);
      context.restore();
    }
  }
}

function drawParticle(
  context: CanvasRenderingContext2D,
  particle: Particle,
  life: number,
  fontFamily: string,
): void {
  context.fillStyle = particle.color;
  switch (particle.kind) {
    case "dust":
    case "drop":
      context.beginPath();
      context.arc(0, 0, particle.size * (particle.kind === "dust" ? 0.6 + life : 1), 0, Math.PI * 2);
      context.fill();
      return;
    case "spark":
      drawStar(context, particle.size * (1 - life * 0.5));
      return;
    case "confetti":
      context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      return;
    case "crumb":
      context.beginPath();
      context.roundRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.8, 3);
      context.fill();
      return;
    case "text":
      context.font = `700 ${particle.size}px ${fontFamily}`;
      context.textAlign = "center";
      context.lineWidth = 5;
      context.strokeStyle = "rgba(58, 36, 89, 0.85)";
      context.strokeText(particle.text, 0, 0);
      context.fillText(particle.text, 0, 0);
      return;
  }
}

function drawStar(context: CanvasRenderingContext2D, radius: number): void {
  context.beginPath();
  for (let point = 0; point < 8; point += 1) {
    const angle = (point / 8) * Math.PI * 2;
    const length = point % 2 === 0 ? radius : radius * 0.4;
    context.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
  }
  context.closePath();
  context.fill();
}
