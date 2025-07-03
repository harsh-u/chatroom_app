from app import app, db

# Create all tables within application context
with app.app_context():
    # Drop all tables first (to handle schema changes)
    db.drop_all()
    # Create all tables
    db.create_all()
    print("Database tables dropped and recreated successfully!")