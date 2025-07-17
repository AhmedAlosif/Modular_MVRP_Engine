export default function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-200">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
