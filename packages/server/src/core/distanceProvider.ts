// Routing port. The only shipped implementation is manual; a real geo provider
// can drop in later without touching callers. Round-trip doubling lives in the
// pure mileage core, not here — providers return the ONE-WAY distance.

export interface DistanceQuery {
  origin: string;
  destination: string;
  // Manual mode: the employee-typed one-way km. A real geo provider ignores it
  // and computes from origin/destination instead.
  manualKm?: number;
}

export interface DistanceProvider {
  // Returns the one-way practical distance in km.
  getDistanceKm(query: DistanceQuery): Promise<number>;
}

export class ManualDistanceProvider implements DistanceProvider {
  async getDistanceKm(query: DistanceQuery): Promise<number> {
    const km = query.manualKm;
    if (km == null || !Number.isFinite(km) || km <= 0) {
      throw new Error("manualKm richiesto e positivo per la modalità manuale.");
    }
    return km;
  }
}

// Test-only: never touches the network. Returns a fixed configured distance.
export class FakeDistanceProvider implements DistanceProvider {
  constructor(private readonly km: number) {}
  async getDistanceKm(_query: DistanceQuery): Promise<number> {
    return this.km;
  }
}
