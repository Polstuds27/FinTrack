/**
 * Design-system barrel.
 *
 * Feature code imports from `@/components/ui` only - components never reach into
 * each other's files, which keeps styling decisions in one place.
 */
export { Button, IconButton, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export {
  Field,
  Input,
  Select,
  Textarea,
  SearchInput,
  type InputProps,
  type SelectProps,
  type TextareaProps,
  type SearchInputProps,
} from "./Input";
export { Overlay, ConfirmOverlay, type OverlayProps } from "./Overlay";
export {
  Card,
  CardHeader,
  Stat,
  Badge,
  ProgressBar,
  Divider,
  Avatar,
  AmountDelta,
  LinkButton,
  type BadgeTone,
} from "./Primitives";
export {
  EmptyState,
  ErrorState,
  Alert,
  Skeleton,
  SkeletonText,
  SkeletonRows,
  SkeletonStats,
  LoadingLabel,
  type ErrorKind,
} from "./Feedback";
export {
  AmountInput,
  Tabs,
  SegmentedControl,
  Dropdown,
  OptionGrid,
  Collapsible,
  type TabItem,
  type SegmentOption,
  type DropdownItem,
} from "./Controls";
export { ToastProvider, useToast, type ToastTone } from "./Toast";
export { Spinner, PageLoader } from "./Spinner";
export { ErrorBoundary } from "./ErrorBoundary";
export {
  ChartFrame,
  ChartLegend,
  BarChart,
  LineChart,
  DonutChart,
  RankedBars,
  Sparkline,
  type SeriesPoint,
  type Slice,
} from "./Charts";
export { PageHeader, BackLink, PeriodStepper, DetailRow } from "./PageHeader";
