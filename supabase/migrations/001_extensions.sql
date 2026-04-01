-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 001: Enable required extensions
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists vector;
create extension if not exists postgis;
