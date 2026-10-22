(defun max3 (a b c)
  (when (>= a b)
    (when (>= a c) (return-from max3 a))
    (return-from max3 c))
  (when (>= b c) (return-from max3 b))
  c)

(defun main ()
  (format t "Largest of 12, 11 and 10: ~d~%" (max3 12 11 10))
  (format t "Largest of 3, 9 and 4: ~d~%" (max3 3 9 4)))

(main)
