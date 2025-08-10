from typing import Dict, List

def load_solution_sol(path: str) -> Dict:
    """
    Parse a typical .sol solution (routes per vehicle).
    Return a normalized dict: {"routes": [[0,3,5,0], [0,2,4,0]], "objective": 1234.5}
    Adjust patterns to your target corpus.
    """
    routes: List[List[int]] = []
    objective = None
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for ln in f:
            ln = ln.strip()
            if ln.lower().startswith("route"):
                # e.g., "Route #1: 1 5 7"
                parts = ln.split(":")
                seq = [int(x) for x in parts[1].split()]
                routes.append([0] + seq + [0])  # add depot, adjust if needed
            elif ln.lower().startswith("cost") or ln.lower().startswith("objective"):
                objective = float(ln.split()[-1])
    return {"routes": routes, "objective": objective}
