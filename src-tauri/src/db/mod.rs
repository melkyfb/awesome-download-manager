pub mod schema;
pub mod repository;

use rusqlite::Connection;
use std::path::Path;

pub fn open_db(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    schema::run_migrations(&conn)?;
    Ok(conn)
}
