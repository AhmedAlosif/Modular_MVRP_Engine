export default function FileUpload({ onImport }) {
  return (
    <div className="mb-2">
      <input
        type="file"
        accept=".geojson"
        onChange={(e) => {
          if (e.target.files?.[0]) onImport(e.target.files[0]);
        }}
      />
    </div>
  );
}