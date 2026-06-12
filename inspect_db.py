import sqlite3
import os

db_path = os.path.join(os.getcwd(), 'database.sqlite')
if not os.path.exists(db_path):
    print("Database file does not exist!")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

tables = ['readings', 'tank_readings', 'rates', 'cash_reconciliation']
for t in tables:
    cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{t}'")
    if not cursor.fetchone():
        print(f"Table {t} does not exist.")
        continue
    
    cursor.execute(f"SELECT COUNT(*) FROM {t}")
    count = cursor.fetchone()[0]
    print(f"Table '{t}' has {count} records.")
    
    if count > 0:
        cursor.execute(f"SELECT * FROM {t} LIMIT 5")
        rows = cursor.fetchall()
        print(f"First 5 records of '{t}':")
        for r in rows:
            print("  ", r)

cursor.execute("SELECT MAX(date) FROM cash_reconciliation")
max_date = cursor.fetchone()[0]
print(f"Latest cash reconciliation date: {max_date}")

conn.close()
