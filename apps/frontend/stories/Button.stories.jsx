import { Button } from "../components/shared/button";

export default {
  title: "Shared/Button",
  component: Button
};

export function Primary() {
  return <Button variant="primary">Primary action</Button>;
}

export function Secondary() {
  return <Button variant="secondary">Secondary action</Button>;
}

export function Ghost() {
  return <Button variant="ghost">Ghost action</Button>;
}

export function Disabled() {
  return <Button disabled>Disabled</Button>;
}
