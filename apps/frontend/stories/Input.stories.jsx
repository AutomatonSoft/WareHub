import { Input } from "../components/shared/input";

export default {
  title: "Shared/Input",
  component: Input
};

export function Default() {
  return <Input placeholder="Type here..." />;
}

export function WithValue() {
  return <Input defaultValue="SKU-123456" />;
}

export function Disabled() {
  return <Input defaultValue="Disabled value" disabled />;
}
