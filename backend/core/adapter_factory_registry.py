class AdapterFactoryRegistry:
    _factories = {}

    @classmethod
    def register(cls, name: str, factory: callable):
        if name in cls._factories:
            raise ValueError(f"Adapter '{name}' is already registered.")
        cls._factories[name] = factory

    @classmethod
    def get(cls, name: str):
        if name not in cls._factories:
            raise ValueError(f"Adapter '{name}' is not registered.")
        return cls._factories[name]()  # Call the factory to create the instance

    @classmethod
    def list_adapters(cls):
        return list(cls._factories.keys())