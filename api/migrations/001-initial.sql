SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.schema_versions') IS NULL
  CREATE TABLE dbo.schema_versions(version int NOT NULL PRIMARY KEY);
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 1)
BEGIN
  CREATE TABLE dbo.devices(
    id nvarchar(80) NOT NULL PRIMARY KEY, name nvarchar(120) NOT NULL,
    temperature_limit float NOT NULL, vibration_limit float NOT NULL
  );
  CREATE TABLE dbo.events(
    event_id nvarchar(128) NOT NULL PRIMARY KEY, device_id nvarchar(80) NOT NULL REFERENCES dbo.devices(id),
    timestamp bigint NOT NULL, temperature_c float NOT NULL, vibration_mm_s float NOT NULL,
    state varchar(16) NOT NULL CHECK (state IN ('running','idle','fault')),
    provenance varchar(16) NOT NULL CHECK (provenance = 'simulated'), payload_hash char(64) NOT NULL,
    CONSTRAINT UQ_events_time UNIQUE(device_id, timestamp)
  );
  CREATE TABLE dbo.alarms(
    id varchar(36) NOT NULL PRIMARY KEY, device_id nvarchar(80) NOT NULL REFERENCES dbo.devices(id),
    metric varchar(16) NOT NULL CHECK (metric IN ('temperature','vibration')),
    threshold float NOT NULL, raised_at bigint NOT NULL, last_seen_at bigint NOT NULL,
    peak_value float NOT NULL, cleared_at bigint NULL, acknowledged_at bigint NULL,
    acknowledged_by nvarchar(200) NULL
  );
  CREATE UNIQUE INDEX UQ_active_alarm ON dbo.alarms(device_id, metric) WHERE cleared_at IS NULL;
  CREATE INDEX IX_alarm_window ON dbo.alarms(raised_at, device_id);
  CREATE TABLE dbo.audit(
    id varchar(36) NOT NULL PRIMARY KEY, actor nvarchar(200) NOT NULL, timestamp bigint NOT NULL,
    action varchar(40) NOT NULL, resource_id nvarchar(128) NOT NULL, details nvarchar(max) NOT NULL
  );
  INSERT INTO dbo.schema_versions(version) VALUES (1);
END;
COMMIT TRANSACTION;
