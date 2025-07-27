import sys
# Add the ../test directory to the Python path
sys.path.append('..\\test')

import argparse
from importlib import import_module
import importlib.util
import up_jsprit  
import unified_planning as up
from unified_planning import engines
from unified_planning.shortcuts import OneshotPlanner
from unified_planning.shortcuts import *
import config

def load_module_from_path(module_name, path_to_file):
    spec = importlib.util.spec_from_file_location(module_name, path_to_file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def main():
    # Set up command-line argument parsing
    parser = argparse.ArgumentParser(description='Execute a planning problem.')
    parser.add_argument('-output', '--output', type=str, default='..\\output\\bestSolution.txt', help='File name containing the best Solution')
    parser.add_argument('-input', '--input', type=str, default='vrp_problem_generator_1', help='Path to the problem file')
    parser.add_argument('-iter', '--iterations', type=int, default=400, help='Max number of iterations')
    parser.add_argument('-geo', '--geocoordinates', type=int, default=False, help='Specify if Distance Matrix and Time MAtrix shall be evaluated using georeferenced coordinates')
    parser.add_argument('--debug', action='store_true', help="Enable debug mode")
    

    args = parser.parse_args()
    
    if args.debug:
        config.DEBUG = True


    # Convert the module path to a valid module name
    module_name = args.input.replace('\\', '.').replace('/', '.')
    if module_name.endswith('.py'):
        module_name = module_name[:-3]

    # Dynamically import the module based on the provided name.
    module = import_module(module_name)
    
    # Generate the VRP problem
    problem = module.generate_vrp_problem()
   
    # Save the parsed problem in a text file
    with open("../test/parsed_problem.txt", 'w') as file:
        file.write(str(problem))

    # Set the environment
    env = up.environment.get_environment()
    env.factory.add_engine('jspritplanner', 'up_jsprit', 'JSpritSolver')

    # Execute the planning code
    with OneshotPlanner(name='jspritplanner', params={'max_iterations': args.iterations, 'working_dir': '../test/', 'problem_filename': 'parsed_problem.txt', 'solution_filename': args.output, 'geocoordinates':False}) as p:
        result = p.solve(problem)
        if result.status == up.engines.PlanGenerationResultStatus.SOLVED_SATISFICING:
            print(f'{p.name} found a valid plan!')
            print(result.plan)
        else:
            print('No plan found!')

if __name__ == '__main__':
    main()