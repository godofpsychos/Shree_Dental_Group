import json
import pandas as pd
import matplotlib.pyplot as plt

# Read data from the "data_record.txt" file
try:
    with open("data_record.txt", "r") as file:
        lines = file.readlines()
except FileNotFoundError:
    print("The file 'data_record.txt' was not found.")
    exit()

# Parse JSON data and create a DataFrame
records = []
for line in lines:
    if not line.strip():
        continue
    record = json.loads(line.strip())
    records.append(record)

df = pd.DataFrame(records)

# Convert the 'date_of_visit' column to datetime
df['date_of_visit'] = pd.to_datetime(df['dental_records'].apply(lambda x: x[0]['date_of_visit']))

# Extract year, month, week, and day from the 'date_of_visit' column
df['year'] = df['date_of_visit'].dt.year
df['month'] = df['date_of_visit'].dt.month
df['week'] = df['date_of_visit'].dt.isocalendar().week
df['day'] = df['date_of_visit'].dt.day

# Group data by different time intervals
daily_patient_count = df.groupby('date_of_visit')['patient_id'].count()
weekly_patient_count = df.groupby(['year', 'week'])['patient_id'].count()
monthly_patient_count = df.groupby(['year', 'month'])['patient_id'].count()
yearly_patient_count = df.groupby('year')['patient_id'].count()

# Generate insights on treatment types
treatment_counts = df['dental_records'].apply(lambda x: x[0]['treatment']).value_counts()

# Plot patient frequency over time
plt.figure(figsize=(14, 10))

plt.subplot(2, 2, 1)
daily_patient_count.plot(title='Patient Frequency per Day')
plt.ylabel('Number of Patients')

plt.subplot(2, 2, 2)
weekly_patient_count.plot(title='Patient Frequency per Week')
plt.ylabel('Number of Patients')

plt.subplot(2, 2, 3)
monthly_patient_count.plot(title='Patient Frequency per Month')
plt.ylabel('Number of Patients')

plt.subplot(2, 2, 4)
yearly_patient_count.plot(title='Patient Frequency per Year')
plt.ylabel('Number of Patients')

plt.tight_layout()

# Plot insights on treatment types
plt.figure(figsize=(10, 6))
treatment_counts.plot(kind='bar', title='Treatment Type Frequency')
plt.xlabel('Treatment Type')
plt.ylabel('Frequency')
plt.xticks(rotation=45)

plt.tight_layout()

plt.show()
