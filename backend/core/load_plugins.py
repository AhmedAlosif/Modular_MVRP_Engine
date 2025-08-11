from core.register_adapters import register_adapters
from core.adapter_factory_registry import AdapterFactoryRegistry

def load_plugins():
    print(">>> load_plugins called")
    register_adapters()
    print(">>> All plugins loaded")
    print(">>> Available adapters:", AdapterFactoryRegistry.list_adapters())