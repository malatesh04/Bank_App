import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline

# Model ID specified by the user
MODEL_ID = "meta-llama/Llama-3.2-3B-Instruct"

def test_pipeline():
    print(f"\n--- Testing with transformers.pipeline ({MODEL_ID}) ---")
    try:
        # Load the pipeline
        # Note: You need to have 'transformers', 'torch', and 'accelerate' installed.
        # You also need to be logged into Hugging Face and have access to Llama 3 models.
        pipe = pipeline(
            "text-generation", 
            model=MODEL_ID, 
            torch_dtype=torch.bfloat16, 
            device_map="auto"
        )
        
        messages = [
            {"role": "user", "content": "Who are you?"},
        ]
        
        outputs = pipe(messages, max_new_tokens=100)
        print("Response:", outputs[0]['generated_text'][-1]['content'])
    except Exception as e:
        print(f"Error in pipeline: {e}")

def test_direct_loading():
    print(f"\n--- Testing with Direct Model Loading ({MODEL_ID}) ---")
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID, 
            torch_dtype=torch.bfloat16, 
            device_map="auto"
        )
        
        messages = [
            {"role": "user", "content": "Who are you?"},
        ]
        
        # Apply chat template
        inputs = tokenizer.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        ).to(model.device)

        # Generate output
        outputs = model.generate(**inputs, max_new_tokens=100)
        
        # Decode only the new tokens
        response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
        print("Response:", response)
    except Exception as e:
        print(f"Error in direct loading: {e}")

if __name__ == "__main__":
    print("Welcome to SBK AI Model Tester")
    print("-------------------------------")
    print("This script will attempt to run Llama-3.2-3B-Instruct locally.")
    print("Requirements: torch, transformers, accelerate, huggingface_hub")
    print("Make sure you have run 'hf auth login' as requested.")
    
    # Uncomment the one you want to test
    test_pipeline()
    # test_direct_loading()
