# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/). This package has not yet been published to npm; the accumulated surface below sits under `[Unreleased]` and becomes its first published version's section at first publish.

## [Unreleased]

## [0.28.0] - 2026-06-03

### Added
- Runtime-reflecting CLI over pi-context's op-registry: the command surface is derived from the registered operations rather than hand-maintained (`b0a831e`)

### Fixed
- String-enum union flags derive as strings rather than JSON (DEFECT-1) (`37f3f31`)
