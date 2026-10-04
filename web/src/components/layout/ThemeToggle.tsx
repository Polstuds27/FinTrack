import { Monitor, Moon, Sun } from "lucide-react";
import { usePreferences, type ThemeMode } from "../../features/settings/preferences";
import { SegmentedControl } from "../ui/Controls";

const OPTIONS: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { id: "light", label: "Light", icon: <Sun aria-hidden="true" className="h-4 w-4" /> },
  { id: "dark", label: "Dark", icon: <Moon aria-hidden="true" className="h-4 w-4" /> },
  { id: "system", label: "System", icon: <Monitor aria-hidden="true" className="h-4 w-4" /> },
];

export function ThemeToggle() {
  const { preferences, update } = usePreferences();
  return (
    <SegmentedControl
      options={OPTIONS}
      value={preferences.theme}
      onChange={(theme) => void update({ theme })}
      size="sm"
      ariaLabel="Colour theme"
    />
  );
}
