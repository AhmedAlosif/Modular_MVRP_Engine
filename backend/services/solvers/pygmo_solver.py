# services/solvers/pygmo_solver.py
import pygmo as pg
import random
from typing import List
from core.interfaces import VRPSolver
from models.vrp import RouteSolution


class VRPProblem:
    """
    A PyGMO-compatible VRP problem for multi-objective optimization.
    """

    def __init__(self, fleet, distance_matrix, time_matrix):
        self.fleet = fleet
        self.dist_matrix = distance_matrix
        self.time_matrix = time_matrix
        self.num_customers = len(distance_matrix) - 1  # assuming depot at index 0
        self.dim = self.num_customers
        self.capacity = fleet[0].capacity if hasattr(fleet[0], "capacity") else None

    def get_nobj(self):
        # Distance & time objectives
        return 2

    def get_bounds(self):
        # Permutation encoding for customers
        return ([0] * self.dim, [self.num_customers - 1] * self.dim)

    def fitness(self, x):
        """
        x: a sequence representing a customer visit order (permutation encoding)
        """
        order = list(map(int, x))
        total_distance = 0.0
        total_time = 0.0
        prev = 0  # start at depot index 0
        load = 0

        for cust in order:
            total_distance += self.dist_matrix[prev][cust + 1]  # +1 because depot is index 0
            total_time += self.time_matrix[prev][cust + 1]
            prev = cust + 1
            if self.capacity:
                load += 1  # simplistic load counting (adapt for real demand)
                if load > self.capacity:
                    total_distance += 1000  # penalty
                    total_time += 1000
        # Return to depot
        total_distance += self.dist_matrix[prev][0]
        total_time += self.time_matrix[prev][0]

        return [total_distance, total_time]

    def get_name(self):
        return "Multi-objective VRP"

    def get_extra_info(self):
        return "Solves VRP with distance & time as objectives"


class PyGMOSolver(VRPSolver):
    """
    Multi-objective VRP solver using PyGMO NSGA-II.
    """

    def solve(self, fleet, matrix):
        # Expecting matrix to contain both distances and durations
        distances = matrix["distances"]
        durations = matrix["durations"]

        # Build problem
        prob = pg.problem(VRPProblem(fleet, distances, durations))

        # Algorithm: NSGA-II with 200 generations
        algo = pg.algorithm(pg.nsga2(gen=200))
        algo.set_verbosity(1)

        # Initial population
        pop = pg.population(prob, size=50)

        # Evolve
        pop = algo.evolve(pop)

        # Choose best by simple weighted sum (for now)
        best_idx = min(range(len(pop.get_f())), key=lambda i: sum(pop.get_f()[i]))
        best_order = list(map(int, pop.get_x()[best_idx]))

        # Convert to route format
        route = [0] + [c + 1 for c in best_order] + [0]  # depot=0
        solution = RouteSolution(routes=[route], total_distance=pop.get_f()[best_idx][0])

        return solution