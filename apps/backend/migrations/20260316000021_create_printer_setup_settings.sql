CREATE TABLE IF NOT EXISTS printer_setup_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  print_width_px INTEGER NOT NULL DEFAULT 384,
  print_height_px INTEGER NOT NULL DEFAULT 640,
  print_density INTEGER NOT NULL DEFAULT 3,
  print_label_type INTEGER NOT NULL DEFAULT 0,
  print_inter_label_delay_ms INTEGER NOT NULL DEFAULT 120,
  print_preview_only BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
