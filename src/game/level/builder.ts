import type { Level, LevelEdge, LevelNode, MoveKind, Platform, PlatformStyle, RouteInfo } from "./types";

interface EdgeOptions {
  readonly risky?: boolean;
  readonly route?: RouteInfo;
}

interface StepOptions extends EdgeOptions {
  readonly checkpoint?: boolean;
  /** Readable id for nodes other code refers to, such as forks and merges. */
  readonly id?: string;
}

export interface NodeRef {
  readonly id: string;
}

/**
 * Authoring DSL for courses. Paths are written as chains of typed moves:
 * `builder.from(start).step("run", "go", 160, 0).step(...)`.
 */
export class LevelBuilder {
  private readonly nodes = new Map<string, LevelNode>();
  private readonly edges = new Map<string, LevelEdge>();
  private readonly platforms: Platform[] = [];
  private edgeCount = 0;

  constructor(
    private readonly id: string,
    private readonly name: string,
    private readonly lakeY: number,
  ) {}

  node(id: string, x: number, y: number, checkpoint = false): NodeRef {
    if (this.nodes.has(id)) throw new Error(`Duplicate node id "${id}"`);
    this.nodes.set(id, { id, x, y, checkpoint });
    return { id };
  }

  platform(left: number, right: number, top: number, style: PlatformStyle): void {
    this.platforms.push({ left, right, top, style });
  }

  from(start: NodeRef): PathCursor {
    return new PathCursor(this, start);
  }

  /** Short ids keep network messages small; edges are referenced by id in every racer event. */
  nextEdgeId(): string {
    this.edgeCount += 1;
    return `e${this.edgeCount}`;
  }

  addEdge(edge: LevelEdge): void {
    if (this.edges.has(edge.id)) throw new Error(`Duplicate edge id "${edge.id}"`);
    this.edges.set(edge.id, edge);
  }

  positionOf(ref: NodeRef): LevelNode {
    const node = this.nodes.get(ref.id);
    if (!node) throw new Error(`Unknown node "${ref.id}"`);
    return node;
  }

  build(start: NodeRef, finish: NodeRef): Level {
    const outgoing = new Map<string, LevelEdge[]>();
    for (const edge of this.edges.values()) {
      const list = outgoing.get(edge.from) ?? [];
      list.push(edge);
      outgoing.set(edge.from, list);
    }
    return {
      id: this.id,
      name: this.name,
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      outgoing,
      startNodeId: start.id,
      finishNodeId: finish.id,
      platforms: [...this.platforms],
      lakeY: this.lakeY,
    };
  }
}

export class PathCursor {
  constructor(
    private readonly builder: LevelBuilder,
    readonly at: NodeRef,
  ) {}

  /** Adds an edge typed with `word` that moves `dx, dy` from the current node to a new node. */
  step(move: MoveKind, word: string, dx: number, dy: number, options: StepOptions = {}): PathCursor {
    const origin = this.builder.positionOf(this.at);
    const edgeId = this.builder.nextEdgeId();
    const target = this.builder.node(
      options.id ?? `n${edgeId.slice(1)}`,
      origin.x + dx,
      origin.y + dy,
      options.checkpoint,
    );
    return this.connect(edgeId, move, word, target, options);
  }

  /** Adds an edge onto an existing node, which is how branches merge back together. */
  stepTo(move: MoveKind, word: string, target: NodeRef, options: EdgeOptions = {}): PathCursor {
    return this.connect(this.builder.nextEdgeId(), move, word, target, options);
  }

  private connect(
    edgeId: string,
    move: MoveKind,
    word: string,
    target: NodeRef,
    options: EdgeOptions,
  ): PathCursor {
    this.builder.addEdge({
      id: edgeId,
      from: this.at.id,
      to: target.id,
      word,
      move,
      risky: options.risky ?? false,
      route: options.route ?? null,
    });
    return new PathCursor(this.builder, target);
  }
}
