import { LevelBuilder } from "./builder";
import type { Level } from "./types";

const GROUND = 600;

/**
 * The one hand-tuned course. Three forks, each trading typing difficulty for speed:
 * Split (safe vs risky), Cliff (safe vs shortcut), and Summit (safe vs shortcut vs risky).
 * Coordinates are world units; y grows downward and every node is a racer's feet position.
 */
function buildJellybeanPeaks(): Level {
  const course = new LevelBuilder("jellybean-peaks", "Jellybean Peaks", 740);

  layOutPlatforms(course);

  const start = course.node("start", 0, GROUND);
  const mergeSplit = course.node("merge-split", 3360, 530);
  const mergeCliff = course.node("merge-cliff", 4800, 220);
  const mergeSummit = course.node("merge-summit", 7100, 540);
  const finish = course.node("finish", 8050, GROUND);

  const split = course
    .from(start)
    .step("run", "go", 160, 0)
    .step("run", "dash", 220, 0)
    .step("hop", "hop", 180, 0)
    .step("run", "sprint", 260, 0)
    .step("leap", "leap", 300, 0)
    .step("run", "jelly", 200, 0)
    .step("hop", "bean", 180, -70)
    .step("run", "zoom", 200, 0, { id: "fork-split", checkpoint: true });

  split
    .step("hop", "meadow", 200, 70, {
      route: { name: "Meadow Loop", tag: "safe", blurb: "Lots of short words. No surprises." },
    })
    .step("run", "puddle", 180, 0)
    .step("hop", "skip", 180, 0)
    .step("run", "candy", 180, 0)
    .step("hop", "twirl", 180, -50)
    .step("run", "stroll", 180, 0)
    .step("hop", "boop", 180, 50)
    .step("run", "drift", 180, 0)
    .stepTo("hop", "sunny", mergeSplit);

  split
    .step("bounce", "brave", 260, -200, {
      route: {
        name: "Biscuit Bridge",
        tag: "risky",
        blurb: "Fewer words, up high. Two slips on a biscuit and you drop.",
      },
    })
    .step("leap", "Biscuit", 340, -10, { risky: true })
    .step("leap", "wobble", 340, -20, { risky: true })
    .step("leap", "Don't look", 340, 20, { risky: true })
    .stepTo("leap", "down!", mergeSplit, { risky: true });

  const cliff = course
    .from(mergeSplit)
    .step("run", "sweet", 240, 0)
    .step("leap", "soar", 340, -50)
    .step("run", "rush", 160, 0)
    .step("hop", "plink", 160, 120)
    .step("run", "nearly", 120, 0, { id: "fork-cliff", checkpoint: true });

  cliff
    .step("run", "vine", 120, 0, {
      route: { name: "Vine Climb", tag: "safe", blurb: "Short words, slow climbing." },
    })
    .step("climb", "grab", 0, -95)
    .step("climb", "pull", 0, -95)
    .step("climb", "reach", 0, -95)
    .step("climb", "heave", 80, -95)
    .stepTo("run", "summit", mergeCliff);

  cliff
    .step("lift", "Pull the lever!", 0, -380, {
      route: {
        name: "Lever Lift",
        tag: "shortcut",
        blurb: "One tricky phrase rockets you to the top.",
      },
    })
    .stepTo("leap", "yeehaw", mergeCliff);

  const summit = course
    .from(mergeCliff)
    .step("run", "breezy", 220, 0)
    .step("leap", "vault", 340, 30)
    .step("run", "skyward", 240, 0)
    .step("run", "edge", 200, 0, { id: "fork-summit", checkpoint: true });

  summit
    .step("hop", "drop", 160, 100, {
      route: { name: "Gumdrop Steps", tag: "safe", blurb: "Hop down the long way." },
    })
    .step("hop", "plop", 160, 100)
    .step("hop", "gumdrop", 170, 150)
    .step("run", "roll", 230, 0)
    .step("hop", "bop", 200, 0)
    .step("run", "trot", 200, 0)
    .stepTo("hop", "hup", mergeSummit);

  summit
    .step("unlock", "Open Sesame 42", 50, 0, {
      id: "secret-door",
      route: { name: "Secret Door", tag: "shortcut", blurb: "Crack the code, ride the slide." },
    })
    .stepTo("slide", "wheee", mergeSummit);

  summit.stepTo("zip", "Hold on tight!", mergeSummit, {
    risky: true,
    route: {
      name: "Zipline",
      tag: "risky",
      blurb: "One phrase, a huge skip. Two slips and the rope snaps.",
    },
  });

  course
    .from(mergeSummit)
    .step("run", "almost", 240, 0)
    .step("leap", "there", 460, 60)
    .stepTo("run", "FINISH", finish);

  return course.build(start, finish);
}

function layOutPlatforms(course: LevelBuilder): void {
  const grounds: ReadonlyArray<readonly [left: number, right: number, top: number]> = [
    [-700, 420, GROUND],
    [480, 900, GROUND],
    [1040, 1400, GROUND],
    [1440, 1790, 530],
    [1840, 2140, GROUND],
    [2200, 2520, GROUND],
    [2580, 2860, 550],
    [2920, 3220, GROUND],
    [3300, 3700, 530],
    [3860, 4140, 480],
    [4200, 4540, GROUND],
    [4540, 5160, 220],
    [5280, 5860, 250],
    [6240, 6620, GROUND],
    [6680, 7000, GROUND],
    [7050, 7700, 540],
    [7760, 8700, GROUND],
  ];
  for (const [left, right, top] of grounds) course.platform(left, right, top, "ground");

  for (const [x, top] of [
    [1960, 330],
    [2300, 320],
    [2640, 300],
    [2980, 320],
  ] as const) {
    course.platform(x - 45, x + 45, top, "crumble");
  }

  course.platform(5915, 6005, 350, "island");
  course.platform(6075, 6165, 450, "island");
}

export const JELLYBEAN_PEAKS: Level = buildJellybeanPeaks();
