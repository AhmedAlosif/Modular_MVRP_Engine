import jpype

class CustomCosts(jpype.JClass("com.graphhopper.jsprit.core.problem.cost.VehicleRoutingTransportCosts")):
    def __init__(self, graphhopper_instance):
        self.gh = graphhopper_instance

    def getTransportCost(self, from, to, departureTime, vehicle):
        # Use the GraphHopper API to calculate the distance between 'from' and 'to'
        # Assuming 'from' and 'to' are Location instances with lat and lon attributes
        route = self.gh.route(from.getLat(), from.getLon(), to.getLat(), to.getLon())
        # Return the distance (or time, depending on your requirements)
        return route.getDistance()

    def getTransportTime(self, from, to, departureTime, vehicle):
        # Use the GraphHopper API to calculate the time between 'from' and 'to'
        route = self.gh.route(from.getLat(), from.getLon(), to.getLat(), to.getLon())
        # Return the time
        return route.getTime()

    def getBackwardTransportTime(self, from, to, arrivalTime, vehicle):
        return self.getTransportTime(from, to, arrivalTime, vehicle)

    def getBackwardTransportCost(self, from, to, arrivalTime, vehicle):
        return self.getTransportCost(from, to, arrivalTime, vehicle)
