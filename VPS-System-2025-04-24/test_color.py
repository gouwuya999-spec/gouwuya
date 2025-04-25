import billing_manager
import os

def main():
    # 创建BillingManager实例
    bm = billing_manager.BillingManager()
    
    # 保存带颜色的Excel文件
    output_file = 'test_color.xlsx'
    result = bm.save_to_excel(output_file)
    
    if result:
        print(f"文件已成功保存到: {os.path.abspath(output_file)}")
    else:
        print("保存失败")
    
if __name__ == "__main__":
    main() 