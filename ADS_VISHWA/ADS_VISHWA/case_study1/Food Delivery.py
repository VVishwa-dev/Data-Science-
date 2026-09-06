print("===== FOOD DELIVERY DECISION SYSTEM =====")


order_amount = float(input("Enter Order Amount (₹): "))
delivery_distance = float(input("Enter Delivery Distance (km): "))
customer_type = input("Customer Type (Regular/Premium/VIP): ").lower()
customer_rating = float(input("Customer Rating (1-5): "))
restaurant_rating = float(input("Restaurant Rating (1-5): "))
preparation_time = int(input("Preparation Time (minutes): "))
payment_method = input("Payment Method (Online/COD): ").lower()
weather = input("Weather (Clear/Rain/Storm): ").lower()
demand = input("Demand Level (Low/Medium/High): ").lower()
peak_hour = input("Peak Hour? (Yes/No): ").lower()
previous_cancellations = int(input("Previous Cancellations: "))


if delivery_distance <= 3:
    delivery_charge = 30
elif delivery_distance <= 8:
    delivery_charge = 50
else:
    delivery_charge = 80


if peak_hour == "yes":
    delivery_charge += 20


if weather == "rain":
    delivery_charge += 10
elif weather == "storm":
    delivery_charge += 30


discount = 0

if customer_type == "vip":
    discount = order_amount * 0.20
elif customer_type == "premium":
    discount = order_amount * 0.10
elif order_amount >= 1000:
    discount = order_amount * 0.05

priority = "No"

if customer_type == "vip":
    priority = "Yes"
elif customer_type == "premium" and order_amount >= 500:
    priority = "Yes"


if previous_cancellations >= 5:
    cancellation_risk = "High"
elif previous_cancellations >= 2:
    cancellation_risk = "Medium"
else:
    cancellation_risk = "Low"


if restaurant_rating >= 4.5:
    restaurant_status = "Excellent"
elif restaurant_rating >= 4:
    restaurant_status = "Good"
elif restaurant_rating >= 3:
    restaurant_status = "Average"
else:
    restaurant_status = "Poor"


manual_review = "No"

if restaurant_rating < 3 or customer_rating < 2:
    order_status = "Rejected"

elif weather == "storm" and delivery_distance > 10:
    order_status = "Rejected"

elif cancellation_risk == "High" and payment_method == "cod":
    order_status = "Rejected"

elif preparation_time > 45:
    order_status = "Manual Review"
    manual_review = "Yes"

elif demand == "high" and peak_hour == "yes":
    order_status = "Manual Review"
    manual_review = "Yes"

else:
    order_status = "Accepted"


if order_status == "Accepted":
    if priority == "Yes":
        final_category = "Priority Accepted"
    else:
        final_category = "Standard Accepted"

elif order_status == "Rejected":
    final_category = "Rejected Order"

else:
    final_category = "Needs Manual Review"


final_payable = order_amount + delivery_charge - discount

if final_payable < 0:
    final_payable = 0


print("\n===================================")
print("       FINAL ORDER REPORT")
print("===================================")

print("Order Status          :", order_status)
print("Manual Review         :", manual_review)
print("Delivery Charge       : ₹", delivery_charge)
print("Discount              : ₹", round(discount, 2))
print("Priority Delivery     :", priority)
print("Cancellation Risk     :", cancellation_risk)
print("Restaurant Status     :", restaurant_status)
print("Final Order Category  :", final_category)
print("Final Payable Amount  : ₹", round(final_payable, 2))

print("===================================")