import { useState } from "react";
import useMapStore from "@/hooks/useMapStore";

const SearchBox = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const addWaypoint = useMapStore((s) => s.addWaypoint);
  const setViewState = useMapStore((s) => s.setViewState);

  const handleSearch = async (e) => {
    const value = e.target.value;
    setQuery(value);

    if (value.length < 3) return;

    const res = await fetch(
      `https://locationiq.com/v1/autocomplete?key=YOUR_KEY&q=${encodeURIComponent(value)}&format=json`
    );
    const data = await res.json();
    setResults(data);
  };

  const handleSelect = (result) => {
    const lng = parseFloat(result.lon);
    const lat = parseFloat(result.lat);

    addWaypoint([lng, lat]);
    setViewState({ longitude: lng, latitude: lat, zoom: 14, pitch: 0, bearing: 0 });
    setQuery("");
    setResults([]);
  };

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={handleSearch}
        placeholder="Search location"
      />
      <ul>
        {results.map((r, i) => (
          <li key={i} onClick={() => handleSelect(r)}>
            {r.display_name}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SearchBox;