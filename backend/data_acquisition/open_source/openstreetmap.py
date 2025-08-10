from OSMPythonTools.api import Api
from OSMPythonTools.overpass import Overpass
from OSMPythonTools.nominatim import Nominatim
from OSMPythonTools.overpass import overpassQueryBuilder
from OSMPythonTools.data import Data, dictRangeYears, ALL
from config import Settings

query = overpassQueryBuilder(area='nyc', elementType='node', selector='"highway"="bus_stop"', out='body')

overpass = Overpass()
busStops = overpass.query(query)

busStops.elements()
# [<OSMPythonTools.element.Element object at 0x10963c9b0>, <OSMPythonTools.element.Element object at 0x10963c8d0>, ...

api = Api()
busStop = api.query('node/42467507')
busStop.apiVersion()
# 0.6
busStop.generator()
# CGImap 0.8.5 (3882970 spike-07.openstreetmap.org)
busStop.copyright()
# OpenStreetMap and contributors
busStop.attribution()
# http://www.openstreetmap.org/copyright
busStop.license()
# http://opendatacommons.org/licenses/odbl/1-0/
coords = [(el.lat(), el.lon()) for el in busStops.elements()]

nominatim = Nominatim()

nyc = nominatim.query('New York')

nyc.address()

nyc.displayName()

nyc.areaId()

nyc.toJSON() #Raw data

nyc = nominatim.query('New York', wkt=True)
nyc.wkt()


def fetch(year, city):
    areaId = nominatim.query(city).areaId()
    query = overpassQueryBuilder(area=areaId, elementType='node', selector='"natural"="tree"', out='count')
    return overpass.query(query, date=year, timeout=60).countElements()
data = Data(fetch, dimensions)